package nats

import (
	"context"
	"time"

	"eve-industry-planner/shared/shared/logs"

	"github.com/nats-io/nats.go/jetstream"
)

// MessageProcessor is a function that processes a single message.
// The processor is responsible for acknowledging or nacking the message.
type MessageProcessor func(msg jetstream.Msg)

// StartMessageProcessingLoop starts a background goroutine that continuously fetches and processes messages
// from the given consumer. The loop will stop when stopChan is closed.
// Messages are fetched in batches of 10 with a 5-second timeout.
func StartMessageProcessingLoop(
	consumer jetstream.Consumer,
	processor MessageProcessor,
	stopChan chan struct{},
	subject string, // For logging purposes
) {
	go func() {
		for {
			select {
			case <-stopChan:
				return
			default:
				// Fetch up to 10 messages at a time
				msgs, err := consumer.Fetch(10, jetstream.FetchMaxWait(5*time.Second))
				if err != nil {
					if err == context.DeadlineExceeded {
						// No messages available, continue
						continue
					}
					logs.Error("failed to fetch messages", "subject", subject, "error", err)
					time.Sleep(time.Second)
					continue
				}

				for msg := range msgs.Messages() {
					jetstreamMsg := msg
					// Acknowledge message receipt immediately to prevent redelivery while processing
					if err := jetstreamMsg.InProgress(); err != nil {
						logs.Warn("failed to send InProgress for message", "subject", subject, "error", err)
					}

					// Process the message using the provided callback
					processor(jetstreamMsg)
				}
			}
		}
	}()
}
