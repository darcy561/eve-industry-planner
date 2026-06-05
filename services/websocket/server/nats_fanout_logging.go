package server

import (
	"context"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/websocket/server/identity"
)

// finishReplicaFanoutOperation emits one consolidated NATS outcome log for fan-out on this
// websocket replica. Successful delivery logs at info with recipient account/session/client ids;
// idle replicas and no-recipient outcomes log at debug with an explicit message suffix.
func finishReplicaFanoutOperation(ctx context.Context, msg, docID, subject string, outcome outboundDeliveryOutcome, extra map[string]interface{}) {
	detail := outboundDeliveryDetail(docID, subject, outcome)
	for k, v := range extra {
		detail[k] = v
	}
	detail["ws_instance_id"] = identity.JetStreamConsumerSuffix()

	level := "debug"
	logMsg := msg
	switch {
	case outcome.RecipientCount > 0:
		level = "info"
	case outcome.CandidateCount == 0:
		detail["replica_idle"] = true
		logMsg = msg + " (idle replica)"
	case outcome.hasSuppression():
		logMsg = msg + " (suppressed on replica)"
	default:
		logMsg = msg + " (no recipients on replica)"
	}
	natscore.FinishNATSConsumerOperation(ctx, level, logMsg, detail)
}
