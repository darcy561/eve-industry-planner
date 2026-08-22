package maintenance

import (
	"slices"
	"testing"

	eipmongo "eve-industry-planner/shared/mongo"
)

// The rotation must be the shared list itself, not a copy of it. A literal here
// would assert only that this file agrees with itself, which is what it did before
// jobs drifted out of the rotation while the batch handler still accepted it.
func TestSchemaMaintenanceRotationIsTheSharedList(t *testing.T) {
	t.Parallel()

	want := eipmongo.SchemaMaintainedCollections()
	if !slices.Equal(schemaMaintenanceCollections, want) {
		t.Fatalf("rotation = %v, want %v", schemaMaintenanceCollections, want)
	}
	for _, c := range want {
		if !slices.Contains(schemaMaintenanceCollections, c) {
			t.Fatalf("%s is not scheduled for schema maintenance", c)
		}
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
