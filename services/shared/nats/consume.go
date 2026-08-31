package nats

import (
	"context"
	"sync"

	"eve-industry-planner/shared/logs"

	"github.com/nats-io/nats.go/jetstream"
)

// MessageProcessor handles one message and is responsible for acknowledging it.
type MessageProcessor func(msg jetstream.Msg)

// ConsumeOption customises a consume loop.
type ConsumeOption func(*consumeOptions)

type consumeOptions struct {
	concurrency int
	stopChan    <-chan struct{}
}

// WithConcurrency bounds how many messages are handled at once. The default is
// one, which preserves per-consumer ordering; raise it only where the handler is
// independent per message.
func WithConcurrency(n int) ConsumeOption {
	return func(o *consumeOptions) {
		if n > 0 {
			o.concurrency = n
		}
	}
}

// WithStopChannel stops the loop when the channel closes, for a caller whose
// lifecycle is a channel rather than a shutdown func.
func WithStopChannel(stopChan <-chan struct{}) ConsumeOption {
	return func(o *consumeOptions) { o.stopChan = stopChan }
}

// Consume delivers a consumer's messages to processor until the returned stop
// function is called, which waits for in-flight handlers to finish. subject is
// used for logs only.
func Consume(consumer jetstream.Consumer, subject string, processor MessageProcessor, opts ...ConsumeOption) (stop func(), err error) {
	cfg := consumeOptions{concurrency: 1}
	for _, opt := range opts {
		opt(&cfg)
	}
	bg := context.Background()

	var (
		wg  sync.WaitGroup
		sem chan struct{}
	)
	if cfg.concurrency > 1 {
		sem = make(chan struct{}, cfg.concurrency)
	}

	handle := func(msg jetstream.Msg) {
		inProgressMessage(bg, msg)
		processor(msg)
	}

	cc, err := consumer.Consume(
		func(msg jetstream.Msg) {
			if sem == nil {
				handle(msg)
				return
			}
			sem <- struct{}{}
			wg.Go(func() {
				defer func() { <-sem }()
				handle(msg)
			})
		},
		jetstream.ConsumeErrHandler(func(_ jetstream.ConsumeContext, err error) {
			logs.WarnCtx(bg, "jetstream consume transport error", "subject", subject, "error", err)
		}),
	)
	if err != nil {
		return nil, err
	}

	stop = sync.OnceFunc(func() {
		cc.Stop()
		wg.Wait()
	})
	if cfg.stopChan != nil {
		go func() {
			<-cfg.stopChan
			stop()
		}()
	}
	return stop, nil
}
