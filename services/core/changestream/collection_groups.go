package changestream

import (
	"fmt"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// CollectionGroup partitions the database change stream: one parallel Watch runs per group.
// Each MongoDB collection name must appear in at most one group (validated at startup).
type CollectionGroup struct {
	ID          string   // Logical name for logs (e.g. "planner", "account")
	Collections []string // Database collection names (match ns.coll on change events)
}

// Group builds a CollectionGroup. Pass eipmongo.Collection* constants (or raw names).
//
// Example — add a new realtime collection:
//
//	Group("widgets", eipmongo.CollectionWidgets)
//
// Or create a new group when you want that collection isolated on its own goroutine:
//
//	Group("reports", "monthly_reports"),
func Group(id string, collections ...string) CollectionGroup {
	copies := append([]string(nil), collections...)
	return CollectionGroup{ID: id, Collections: copies}
}

// CollectionGroups defines how collections are split across parallel change streams.
// Edit this registry to add collections or groups without changing watcher logic.
func CollectionGroups() []CollectionGroup {
	return []CollectionGroup{
		Group("account",
			eipmongo.CollectionUsers,
			eipmongo.CollectionApplicationSettings,
			eipmongo.CollectionUserWatchlistDeprecated,
		),
		Group("planner",
			eipmongo.CollectionJobs,
			eipmongo.CollectionUserJobDocuments,
			eipmongo.CollectionUserJobGroups,
		),
		Group("archive_and_stats",
			eipmongo.CollectionArchivedJobs,
			eipmongo.CollectionBuildStats,
		),
		Group("blueprints",
			eipmongo.CollectionBlueprints,
		),
	}
}

// MatchPipelineForCollections returns a change stream pipeline that filters to these ns.coll values.
func MatchPipelineForCollections(collectionNames []string) mongo.Pipeline {
	if len(collectionNames) == 0 {
		return mongo.Pipeline{}
	}
	return mongo.Pipeline{
		bson.D{{Key: "$match", Value: bson.M{
			"ns.coll": bson.M{"$in": collectionNames},
		}}},
	}
}

func validateCollectionGroups(groups []CollectionGroup) error {
	seen := make(map[string]string)
	for _, g := range groups {
		if g.ID == "" {
			return fmt.Errorf("changestream: collection group has empty ID")
		}
		if len(g.Collections) == 0 {
			return fmt.Errorf("changestream: group %q has no collections", g.ID)
		}
		for _, c := range g.Collections {
			if c == "" {
				return fmt.Errorf("changestream: group %q has empty collection name", g.ID)
			}
			if prev, ok := seen[c]; ok {
				return fmt.Errorf("changestream: collection %q appears in groups %q and %q", c, prev, g.ID)
			}
			seen[c] = g.ID
		}
	}
	return nil
}
