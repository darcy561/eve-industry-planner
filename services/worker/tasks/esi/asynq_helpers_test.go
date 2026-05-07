package tasks

import (
	"testing"

	natscore "eve-industry-planner/shared/core/nats"

	"github.com/hibiken/asynq"
)

// Regression: PublishTask(nil) / CLI with no --data omitted TaskMessage.data; worker must not fail on empty inner JSON.
func TestUnmarshalTaskPayload_MissingInnerData(t *testing.T) {
	const wire = `{"task_type":"processDirtyCorpBuildStats","data":{"task_type":"processDirtyCorpBuildStats"}}`
	task := asynq.NewTask("processDirtyCorpBuildStats", []byte(wire))
	_, err := UnmarshalTaskPayload[natscore.ProcessDirtyCorpBuildStatsRequest](task)
	if err != nil {
		t.Fatalf("expected empty inner data to decode as zero request: %v", err)
	}
}
