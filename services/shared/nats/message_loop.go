package nats

import (
	"context"

	"eve-industry-planner/shared/logs"

	"github.com/nats-io/nats.go/jetstream"
)

// MessageProcessor is a function that processes a single message.
// The processor is responsible for acknowledging or nacking the message.
type MessageProcessor func(msg jetstream.Msg)

// StartMessageProcessingLoop runs a durable pull consumer using [jetstream.Consumer.Consume].
// This avoids polling [Consumer.Fetch] in a loop (which creates a new pull subscription per
// iteration and does not overlap pulls—see nats.go jetstream Consumer docs).
func StartMessageProcessingLoop(
	consumer jetstream.Consumer,
	processor MessageProcessor,
	stopChan chan struct{},
	subject string, // For logging purposes
) {
	bg := context.Background()

	cc, err := consumer.Consume(
		func(msg jetstream.Msg) {
			InProgressMessage(bg, msg)
			processor(msg)
		},
		jetstream.ConsumeErrHandler(func(_ jetstream.ConsumeContext, err error) {
			logs.WarnCtx(bg, "jetstream consume transport error", "subject", subject, "error", err)
		}),
	)
	if err != nil {
		logs.ErrorCtx(bg, "failed to start jetstream consume loop", "subject", subject, "error", err)
		return
	}

	go func() {
		<-stopChan
		cc.Stop()
	}()
}
