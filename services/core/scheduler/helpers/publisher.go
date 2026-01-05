package helpers

import (
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/scheduler"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// PublishTaskTrigger publishes an empty message to trigger a task execution on the worker stream.
// This is a convenience wrapper around scheduler.PublishEmptyMessage for publishing to WorkerTaskStream.
func PublishTaskTrigger(js jetstream.JetStream, subject string, natsConn *natslib.Conn) error {
	return scheduler.PublishEmptyMessage(js, subject, natsConn)
}

// PublishTaskMessage publishes a task message with data to the worker stream.
// This is a convenience wrapper around scheduler.PublishTaskMessage for publishing to WorkerTaskStream.
func PublishTaskMessage(js jetstream.JetStream, subject string, taskType string, data interface{}, natsConn *natslib.Conn) error {
	return scheduler.PublishTaskMessage(js, subject, taskType, data, natsConn)
}

// EnsureWorkerTaskStream ensures the worker task stream exists with its configured subjects.
// This is a convenience wrapper around natscore.EnsureWorkerTaskStream.
func EnsureWorkerTaskStream(js jetstream.JetStream) error {
	return natscore.EnsureWorkerTaskStream(js)
}

