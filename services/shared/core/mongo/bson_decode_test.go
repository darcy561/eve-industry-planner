package mongo

import (
	"bytes"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestAsDocumentM(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		in   any
		want bson.M // nil means expect nil result
	}{
		{"nil", nil, nil},
		{"bson.M", bson.M{"a": "1", "n": 2}, bson.M{"a": "1", "n": 2}},
		{"map[string]any", map[string]any{"a": "1"}, bson.M{"a": "1"}},
		{
			"bson.D",
			bson.D{{Key: "accountID", Value: "acct-1"}, {Key: "n", Value: 3}},
			bson.M{"accountID": "acct-1", "n": 3},
		},
		{
			"bson.D nested value stays nested",
			bson.D{{Key: "_meta", Value: bson.D{{Key: "accountID", Value: "acct-2"}}}},
			bson.M{"_meta": bson.D{{Key: "accountID", Value: "acct-2"}}},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := AsDocumentM(tc.in)
			if tc.want == nil {
				if got != nil {
					t.Fatalf("got %#v, want nil", got)
				}
				return
			}
			if got == nil {
				t.Fatal("got nil")
			}
			if len(got) != len(tc.want) {
				t.Fatalf("len=%d want %d (%#v)", len(got), len(tc.want), got)
			}
			for k, wantVal := range tc.want {
				gotVal, ok := got[k]
				if !ok {
					t.Fatalf("missing key %q", k)
				}
				switch w := wantVal.(type) {
				case bson.D:
					gd, ok := gotVal.(bson.D)
					if !ok || len(gd) != len(w) || gd[0].Key != w[0].Key || gd[0].Value != w[0].Value {
						t.Fatalf("key %q: got %#v want %#v", k, gotVal, wantVal)
					}
				default:
					if gotVal != wantVal {
						t.Fatalf("key %q: got %#v want %#v", k, gotVal, wantVal)
					}
				}
			}
		})
	}
}

func TestUnmarshalDocumentM_nestedIsBsonM(t *testing.T) {
	t.Parallel()
	type meta struct {
		AccountID string `bson:"accountID"`
	}
	type doc struct {
		ID   string `bson:"_id"`
		Meta meta   `bson:"_meta"`
	}
	raw, err := bson.Marshal(doc{ID: "j1", Meta: meta{AccountID: "acct-1"}})
	if err != nil {
		t.Fatal(err)
	}

	// Default Unmarshal nests as bson.D (v2 default).
	var plain bson.M
	if err := bson.Unmarshal(raw, &plain); err != nil {
		t.Fatal(err)
	}
	if _, ok := plain["_meta"].(bson.D); !ok {
		t.Fatalf("plain Unmarshal _meta type=%T want bson.D", plain["_meta"])
	}

	got, err := UnmarshalDocumentM(raw)
	if err != nil {
		t.Fatal(err)
	}
	metaM, ok := got["_meta"].(bson.M)
	if !ok {
		t.Fatalf("_meta type=%T want bson.M", got["_meta"])
	}
	if metaM["accountID"] != "acct-1" {
		t.Fatalf("accountID=%#v", metaM["accountID"])
	}

	// Decoder DefaultDocumentM path matches helper.
	dec := bson.NewDecoder(bson.NewDocumentReader(bytes.NewReader(raw)))
	dec.DefaultDocumentM()
	var viaDec bson.M
	if err := dec.Decode(&viaDec); err != nil {
		t.Fatal(err)
	}
	if _, ok := viaDec["_meta"].(bson.M); !ok {
		t.Fatalf("decoder _meta type=%T want bson.M", viaDec["_meta"])
	}
}
