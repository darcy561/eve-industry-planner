package changestream

import (
	"testing"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestWithoutSessionMeta_takesTheWritersSessionOutOfWhatIsDelivered(t *testing.T) {
	t.Parallel()
	stored := bson.M{
		"jobID": "job-1",
		models.MetaFieldName: bson.M{
			models.MetaFieldSessionID: "sess-secret",
			models.MetaFieldClientID:  "client-1",
			models.MetaFieldRevision:  int64(4),
		},
	}

	delivered := withoutSessionMeta(map[string]any(stored))

	meta := subDocumentToMap(delivered[models.MetaFieldName])
	if _, held := meta[models.MetaFieldSessionID]; held {
		t.Fatalf("the writer's session was delivered: %v", meta)
	}
	if meta[models.MetaFieldClientID] != "client-1" || meta[models.MetaFieldRevision] != int64(4) {
		t.Fatalf("the rest of _meta was not kept: %v", meta)
	}
}

func TestWithoutSessionMeta_leavesADocumentWithoutMetaAlone(t *testing.T) {
	t.Parallel()
	if got := withoutSessionMeta(nil); got != nil {
		t.Fatalf("nil document = %v", got)
	}
	doc := map[string]any{"jobID": "job-1"}
	if got := withoutSessionMeta(doc); len(got) != 1 {
		t.Fatalf("document without _meta changed: %v", got)
	}
}
