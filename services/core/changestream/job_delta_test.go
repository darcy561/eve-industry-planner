package changestream

import (
	"maps"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func updateAt(revision any, updated bson.M) bson.M {
	fields := bson.M{"_meta.revision": revision}
	maps.Copy(fields, updated)
	return bson.M{"updatedFields": fields}
}

func TestJobDeltaForStatesOneOnlyWhenItCan(t *testing.T) {
	t.Parallel()

	jobCount := bson.M{"build.setup.s1.jobCount": 3}

	for name, tc := range map[string]struct {
		update bson.M
		want   bool
	}{
		"a changed field and the revision it wrote": {updateAt(int64(8), jobCount), true},
		"a revision the driver read as int32":       {updateAt(int32(8), jobCount), true},
		"a revision the driver read as double":      {updateAt(float64(8), jobCount), true},
		"a revision written inside a whole _meta": {
			bson.M{"updatedFields": bson.M{"_meta": bson.M{"revision": int64(8)}, "name": "A job"}}, true,
		},
		"only the revision, which is still a change": {updateAt(int64(8), bson.M{}), true},
		"a cleared row and the revision": {
			bson.M{
				"updatedFields": bson.M{"_meta.revision": int64(8)},
				"removedFields": bson.A{"build.extrasCosts.e-1"},
			}, true,
		},
		"no update description": {nil, false},
		"an update that did not move the revision": {
			bson.M{"updatedFields": jobCount}, false,
		},
		"a revision below the one a document is seeded with": {updateAt(int64(0), jobCount), false},
		"a path the model does not store": {
			updateAt(int64(8), bson.M{"build.nonsense": 1}), false,
		},
		"a positional path into a list": {
			updateAt(int64(8), bson.M{"parentJobs.0": "job-7"}), false,
		},
		"a ref set on its own": {
			updateAt(int64(8), bson.M{"esi.marketOrders.900.corporation_ref": "ref-5"}), false,
		},
		"an unreadable changed path beside a readable cleared one": {
			bson.M{
				"updatedFields": bson.M{"_meta.revision": int64(8), "build.nonsense": 1},
				"removedFields": bson.A{"build.extrasCosts.e-1"},
			}, false,
		},
		"an unreadable cleared path beside a readable changed one": {
			bson.M{
				"updatedFields": bson.M{"_meta.revision": int64(8), "name": "A job"},
				"removedFields": bson.A{"build.nonsense"},
			}, false,
		},
		"a cleared entry that is not a path": {
			bson.M{
				"updatedFields": bson.M{"_meta.revision": int64(8), "name": "A job"},
				"removedFields": bson.A{"build.extrasCosts.e-1", 7},
			}, false,
		},
		"an array Mongo reports as truncated": {
			bson.M{
				"updatedFields":   bson.M{"_meta.revision": int64(8), "name": "A job"},
				"truncatedArrays": bson.A{bson.M{"field": "parentJobs", "newSize": 1}},
			}, false,
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, got := jobDeltaFor(tc.update); got != tc.want {
				t.Errorf("want a delta stated: %v, got %v", tc.want, got)
			}
		})
	}
}

func TestJobDeltaNamesTheRevisionItWroteAndTheOneItAppliesOnto(t *testing.T) {
	t.Parallel()

	delta, ok := jobDeltaFor(bson.M{
		"updatedFields": bson.M{"_meta.revision": int64(8), "name": "A job"},
		"removedFields": bson.A{"build.extrasCosts.e-1"},
	})

	if !ok {
		t.Fatal("want a delta")
	}
	if delta.Revision != 8 || delta.AppliesTo != 7 {
		t.Errorf("want 8 applying onto 7, got %d onto %d", delta.Revision, delta.AppliesTo)
	}
	if len(delta.Removed) != 1 || delta.Removed[0][2] != "e-1" {
		t.Errorf("want the cleared row, got %v", delta.Removed)
	}
}

func TestJobDeltaCarriesEachChangeAtThePathMongoReported(t *testing.T) {
	t.Parallel()

	delta, ok := jobDeltaFor(updateAt(int64(8), bson.M{
		"name":              "A job",
		"build.extrasCosts": bson.M{},
		"protected":         bson.M{"fields": bson.A{"name"}},
	}))
	if !ok {
		t.Fatal("want a delta")
	}

	byPath := map[string]any{}
	for _, change := range delta.Changed {
		byPath[strings.Join(change.Path, ".")] = change.Value
	}
	if byPath["name"] != "A job" {
		t.Errorf("want the name at its own path, got %v", byPath)
	}
	if held, ok := byPath["build.extrasCosts"].(map[string]any); !ok || len(held) != 0 {
		t.Errorf("want the emptied collection as the value that replaces it, got %v", byPath)
	}
	if _, held := byPath["protected"]; held {
		t.Errorf("want protected dropped, got %v", byPath)
	}
}
