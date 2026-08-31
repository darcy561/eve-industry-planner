// Package sdeensure runs live-SDE existence checks on every core replica.
// Not primary-gated and not part of /ready.
package sdeensure

import (
	"context"

	"eve-industry-planner/core/startup"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/stackservices"
)

// Run checks live SDE once (warn-continue). Call via lifecycle.GoCtx from main.
func Run(ctx context.Context, clients *stackservices.Clients) {
	if clients == nil {
		logs.WarnCtx(ctx, "sdeensure: no clients; skip")
		return
	}
	if err := startup.EnsureLiveSDEExists(ctx, clients.NATS); err != nil {
		logs.WarnCtx(ctx, "sdeensure: live SDE ensure failed (continuing)", "error", err)
	}
}
