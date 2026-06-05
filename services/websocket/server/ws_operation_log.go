package server

import (
	"context"
	"time"

	"eve-industry-planner/shared/logs"

	"go.uber.org/zap"
)

func wsEmitOperationLog(ctx context.Context, client *Client, level, msg string, detail map[string]interface{}, steps []logs.DebugStep, caveats []logs.HandlerCaveat) {
	if detail == nil {
		detail = map[string]interface{}{}
	}
	if start, ok := logs.RequestStartTime(ctx); ok && !start.IsZero() {
		detail["duration_ms"] = time.Since(start).Milliseconds()
	}
	if messageID := wsMessageIDFromContext(ctx); messageID != "" {
		detail["message_id"] = messageID
	}

	fields := []zap.Field{logs.Ctx(ctx)}
	if client != nil {
		if client.AccountID != "" {
			fields = append(fields, zap.String("account_id", client.AccountID))
		}
		if client.SessionID != "" {
			fields = append(fields, zap.String("session_id", client.SessionID))
		}
	}
	fields = append(fields, logs.AccessLogDetailFields(detail)...)
	if len(steps) > 0 {
		fields = append(fields, zap.Any(logs.DebugStepsLogKey, logs.DebugStepsForLog(steps)))
	}
	if len(caveats) > 0 {
		fields = append(fields, zap.Any("caveats", logs.HandlerCaveatsForLog(caveats)))
	}

	logger := logs.FromContext(ctx)
	switch level {
	case "warn":
		logger.Warn(msg, fields...)
	case "error":
		logger.Error(msg, fields...)
	case "debug":
		logger.Debug(msg, fields...)
	default:
		logger.Info(msg, fields...)
	}
}

func wsEmitOperationOutcome(ctx context.Context, client *Client, success bool, msg string, detail map[string]interface{}, successLevel string) {
	caveats := logs.HandlerCaveatsFromContext(ctx)
	level := "info"
	switch {
	case !success:
		level = "warn"
	case len(caveats) > 0:
		level = "warn"
	case successLevel != "":
		level = successLevel
	}
	steps := logs.DebugStepsFromContext(ctx)
	wsEmitOperationLog(ctx, client, level, msg, detail, steps, caveats)
}

func wsAppendDebugStep(ctx context.Context, step string, extra map[string]interface{}) {
	logs.AttachDebugStepCtx(ctx, step, extra)
}
