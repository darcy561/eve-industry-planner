package maintenance

import (
	"slices"
	"testing"

	eipmongo "eve-industry-planner/shared/mongo"
)

// Every collection whose documents carry a schemaVersion must be in the rotation,
// or its documents never reach the current schema.
func TestSchemaMaintenanceCoversVersionedCollections(t *testing.T) {
	t.Parallel()

	want := []string{
		eipmongo.CollectionUsers,
		eipmongo.CollectionApplicationSettings,
		eipmongo.CollectionUserJobDocuments,
		eipmongo.CollectionArchivedJobs,
		eipmongo.CollectionUserJobGroups,
	}

	for _, c := range want {
		if !slices.Contains(schemaMaintenanceCollections, c) {
			t.Fatalf("%s is not scheduled for schema maintenance", c)
		}
	}
	if len(schemaMaintenanceCollections) != len(want) {
		t.Fatalf("rotation = %v, want exactly %v", schemaMaintenanceCollections, want)
	}
}

func TestSchemaMaintenanceRotationHasNoDuplicates(t *testing.T) {
	t.Parallel()

	seen := map[string]struct{}{}
	for _, c := range schemaMaintenanceCollections {
		if _, dup := seen[c]; dup {
			t.Fatalf("%s appears twice in the rotation, so it is visited twice per cycle", c)
		}
		seen[c] = struct{}{}
	}
}
