package commands

import (
	"context"
	"fmt"
	"strings"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/schemamaint"
	"eve-industry-planner/shared/stackservices"
)

// releaseSchemaBatchSize bounds one upgrade pass. The rotation uses a smaller
// batch because it shares a worker with live traffic; this runs in a window with
// nothing else competing.
const releaseSchemaBatchSize = 1000

// completeSchemaMaintenance brings every schema-maintained collection to its
// current version before the rest of the release runs.
//
// The hourly rotation visits one collection per tick, so an environment can sit
// with documents several versions behind indefinitely — which is fine while every
// read goes through the upgrader, and not fine here. Later steps stamp the
// current version onto documents they touch, so a document still owing an earlier
// upgrade would have that step skipped and be recorded as current without ever
// having run it.
//
// Draining first is what makes the rest of the release meet one shape.
func completeSchemaMaintenance(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	var reports []string

	for _, name := range eipmongo.SchemaMaintainedCollections() {
		docs := clients.Mongo.Docs(name)

		if dryRun {
			current, err := schemamaint.CurrentVersion(name)
			if err != nil {
				return "", err
			}
			behind, err := docs.Collection().CountDocuments(ctx, map[string]any{"$or": []map[string]any{
				{"schemaVersion": map[string]any{"$lt": current}},
				{"schemaVersion": map[string]any{"$exists": false}},
			}})
			if err != nil {
				return "", fmt.Errorf("count %s below v%d: %w", name, current, err)
			}
			if behind == 0 {
				reports = append(reports, fmt.Sprintf("%s: already at v%d", name, current))
				continue
			}
			reports = append(reports, fmt.Sprintf("%s: %d below v%d would upgrade", name, behind, current))
			continue
		}

		summary, err := schemamaint.Drain(ctx, docs, name, releaseSchemaBatchSize)
		if err != nil {
			return "", fmt.Errorf("%s: %w", name, err)
		}
		// Remaining above zero means the drain stopped making progress with
		// documents still behind — they are named rather than passed over,
		// because a later step would stamp them as current regardless.
		switch {
		case summary.Remaining > 0:
			reports = append(reports, fmt.Sprintf("%s: %d upgraded, %d STILL BEHIND", name, summary.Upgraded, summary.Remaining))
		case summary.Upgraded == 0:
			reports = append(reports, fmt.Sprintf("%s: already current", name))
		default:
			reports = append(reports, fmt.Sprintf("%s: %d upgraded", name, summary.Upgraded))
		}
	}

	return strings.Join(reports, "; "), nil
}
