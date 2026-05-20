package nats

import (
	"context"
	"encoding/json"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

const otelTracerNameNATS = "eve-industry-planner/shared/nats"

// taskMessageInnerJSON returns TaskMessage.Data when data is a TaskMessage envelope; otherwise raw data.
func taskMessageInnerJSON(data json.RawMessage) json.RawMessage {
	if len(data) == 0 {
		return nil
	}
	var tm TaskMessage
	if err := json.Unmarshal(data, &tm); err != nil {
		return data
	}
	if len(tm.Data) > 0 {
		return tm.Data
	}
	return data
}

// taskDataAttrsFromJSON maps task payload JSON (TaskMessage.Data content) to task.data.* span attributes.
// Single implementation shared by nats.publish_task and worker asynq.task.
func taskDataAttrsFromJSON(taskType string, raw []byte) []attribute.KeyValue {
	if len(raw) == 0 {
		return nil
	}
	switch taskType {
	case "refreshMarketPrices", "fetchMissingMarketPrices":
		var req MarketPricesRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return nil
		}
		return marketPricesRequestAttrs(req)
	case "applySDEVersion":
		var req SDEApplyVersionRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return nil
		}
		return []attribute.KeyValue{attribute.Int("task.data.build_number", req.BuildNumber)}
	case "updateAccountSessionGrants":
		var req AccountSessionGrantsRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return nil
		}
		return accountSessionGrantsAttrs(req)
	case "migrateUserDocumentToMongo", "migrateFirestoreWatchlistToMongo", "importUserJobDocumentsForAccount", "inactiveAccountPlannerCleanup", "cloudStoredEsiRefreshMaintenance":
		var req MigrateUserDocumentToMongoRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return nil
		}
		if req.AccountID == "" {
			return nil
		}
		return []attribute.KeyValue{attribute.String("task.data.account_id", req.AccountID)}
	case "processCorpArchivedJobSnapshots":
		var req ProcessCorpArchivedJobSnapshotsRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return nil
		}
		if req.CorpRef == "" {
			return nil
		}
		return []attribute.KeyValue{attribute.String("task.data.corp_ref", req.CorpRef)}
	case "processDirtyAccountBuildStats":
		var req ProcessDirtyAccountBuildStatsRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return nil
		}
		if req.AccountID == "" {
			return nil
		}
		return []attribute.KeyValue{attribute.String("task.data.account_id", req.AccountID)}
	case "processDirtyCorpBuildStats":
		var req ProcessDirtyCorpBuildStatsRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return nil
		}
		if req.CorpRef == "" {
			return nil
		}
		return []attribute.KeyValue{attribute.String("task.data.corp_ref", req.CorpRef)}
	default:
		return nil
	}
}

// AsynqTaskPayloadSpanAttributes returns task.data.* attributes from an asynq task body (Enqueue wire format).
// Use on the worker asynq span so the task span carries payload alongside nats.publish_task (logs / trace_id correlation).
func AsynqTaskPayloadSpanAttributes(taskType string, asynqPayload []byte) []attribute.KeyValue {
	var wrap struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(asynqPayload, &wrap); err != nil {
		return nil
	}
	inner := taskMessageInnerJSON(wrap.Data)
	return taskDataAttrsFromJSON(taskType, inner)
}

// startPublishTaskSpan starts a producer span for a JetStream task publish.
func startPublishTaskSpan(ctx context.Context, subject, taskType string, taskDataAttrs []attribute.KeyValue) (context.Context, trace.Span) {
	tracer := otel.Tracer(otelTracerNameNATS)
	opts := []trace.SpanStartOption{
		trace.WithSpanKind(trace.SpanKindProducer),
		trace.WithAttributes(
			attribute.String("messaging.system", "nats"),
			attribute.String("messaging.destination.name", subject),
			attribute.String("task.type", taskType),
		),
	}
	if len(taskDataAttrs) > 0 {
		opts = append(opts, trace.WithAttributes(taskDataAttrs...))
	}
	return tracer.Start(ctx, "nats.publish_task", opts...)
}

func marketPricesRequestAttrs(req MarketPricesRequest) []attribute.KeyValue {
	return []attribute.KeyValue{
		attribute.Int64("task.data.type_id", int64(req.TypeID)),
		attribute.Int64("task.data.location_id", int64(req.LocationID)),
		attribute.Int64("task.data.station_id", req.StationID),
	}
}

func accountSessionGrantsAttrs(req AccountSessionGrantsRequest) []attribute.KeyValue {
	attrs := []attribute.KeyValue{
		attribute.Int("task.data.token_count", len(req.Tokens)),
	}
	if req.AccountID != "" {
		attrs = append(attrs, attribute.String("task.data.account_id", req.AccountID))
	}
	return attrs
}
