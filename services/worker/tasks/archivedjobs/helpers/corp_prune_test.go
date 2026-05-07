package helpers

import (
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

func TestCorpBuildStatsPruneFilter(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		ref     string
		keepIDs []string
		want    bson.M
	}{
		{
			name:    "no keep ids deletes all docs under ref prefix",
			ref:     "corpOpaqueRef123",
			keepIDs: nil,
			want: bson.M{
				"_id": bson.M{"$regex": "^corpOpaqueRef123\\|"},
			},
		},
		{
			name:    "empty keep ids same as nil",
			ref:     "corpOpaqueRef123",
			keepIDs: []string{},
			want: bson.M{
				"_id": bson.M{"$regex": "^corpOpaqueRef123\\|"},
			},
		},
		{
			name:    "keep ids adds nin to scoped delete",
			ref:     "corpOpaqueRef123",
			keepIDs: []string{"corpOpaqueRef123|5", "corpOpaqueRef123|9"},
			want: bson.M{
				"_id": bson.M{"$regex": "^corpOpaqueRef123\\|", "$nin": []string{"corpOpaqueRef123|5", "corpOpaqueRef123|9"}},
			},
		},
		{
			name:    "regex meta characters in ref are escaped",
			ref:     "ref|with|pipes",
			keepIDs: nil,
			want: bson.M{
				"_id": bson.M{"$regex": "^ref\\|with\\|pipes\\|"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := CorpBuildStatsPruneFilter(tt.ref, tt.keepIDs)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("CorpBuildStatsPruneFilter(%q, %v) = %#v; want %#v", tt.ref, tt.keepIDs, got, tt.want)
			}
		})
	}
}
