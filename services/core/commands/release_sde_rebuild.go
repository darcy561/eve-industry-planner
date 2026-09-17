package commands

import (
	"context"
	"fmt"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/stackservices"
)

// rebuildCurrentSDEVersion asks the SDE to be built again at the version already
// in use.
//
// The documents it produces — the shared blueprints among them — are written by
// the task that owns them, so a release that needs their shape changed asks for
// them to be reproduced rather than reaching into the collection itself. The
// ordinary write path stamps whatever a new document is owed on the way past,
// which is why this is a step rather than another walk.
//
// The work happens on the worker, so this reports that it was asked for. A
// release does not wait on it: nothing a reader sees depends on the rebuild
// having finished, and the version in use does not change.
func rebuildCurrentSDEVersion(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	if clients == nil || clients.NATS == nil {
		return "", fmt.Errorf("rebuild current SDE version: no NATS handle")
	}
	if dryRun {
		return "would ask for the current SDE version to be rebuilt", nil
	}
	if err := eipnats.TriggerRebuildCurrentSDEVersion(ctx, clients.NATS); err != nil {
		return "", fmt.Errorf("publish %s: %w", eipnats.RebuildCurrentSDEVersion.Name, err)
	}
	return "asked for the current SDE version to be rebuilt", nil
}
