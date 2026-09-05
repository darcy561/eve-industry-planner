package maintenance

import (
	"testing"

	eipmongo "eve-industry-planner/shared/mongo"
)

// Every collection the scheduler rotates must be one this handler dispatches, or
// the tick fails with "unsupported schema maintenance collection". The two lists
// live apart — one in core, one here — so only a test spanning both catches drift.
func TestHandlerAcceptsEveryScheduledCollection(t *testing.T) {
	t.Parallel()

	for _, collection := range eipmongo.SchemaMaintainedCollections() {
		if !schemaMaintenanceCollectionSupported(collection) {
			t.Errorf("%s is scheduled for maintenance but the batch handler rejects it", collection)
		}
	}
	if schemaMaintenanceCollectionSupported("not_a_collection") {
		t.Error("an unknown collection must not be reported as supported")
	}
}
