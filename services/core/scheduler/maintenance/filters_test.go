package maintenance

import (
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
)

func TestCloudEsiRefreshUserFilter_Contract(t *testing.T) {
	sixMo := time.Date(2026, 1, 10, 0, 0, 0, 0, time.UTC)
	rotateCutoff := time.Date(2026, 5, 5, 12, 0, 0, 0, time.UTC)

	f := cloudEsiRefreshUserFilter(sixMo, rotateCutoff, "")
	ext, err := bson.MarshalExtJSON(f, true, false)
	if err != nil {
		t.Fatal(err)
	}
	s := string(ext)
	if !strings.Contains(s, `"userCloudAccounts":true`) {
		t.Fatalf("expected cloud flag in filter: %s", s)
	}
	if !strings.Contains(s, `"_meta.lastLoginAt"`) {
		t.Fatalf("expected lastLoginAt window: %s", s)
	}
	if !strings.Contains(s, `"$ifNull"`) {
		t.Fatalf("expected refreshTokens size expr: %s", s)
	}

	f2 := cloudEsiRefreshUserFilter(sixMo, rotateCutoff, "accZ")
	ext2, err := bson.MarshalExtJSON(f2, true, false)
	if err != nil {
		t.Fatal(err)
	}
	s2 := string(ext2)
	if !strings.Contains(s2, `"$gt": "accZ"`) && !strings.Contains(s2, `"$gt":"accZ"`) {
		t.Fatalf("expected bookmark _id $gt: %s", s2)
	}
}

func TestInactiveLoginUserFilter_Contract(t *testing.T) {
	cutoff := time.Date(2024, 3, 1, 0, 0, 0, 0, time.UTC)
	f := inactiveLoginUserFilter(cutoff, "")
	ext, err := bson.MarshalExtJSON(f, true, false)
	if err != nil {
		t.Fatal(err)
	}
	s := string(ext)
	if !strings.Contains(s, `"_meta.lastLoginAt"`) {
		t.Fatalf("expected stale login clause: %s", s)
	}

	f2 := inactiveLoginUserFilter(cutoff, "bookmarkX")
	ext2, err := bson.MarshalExtJSON(f2, true, false)
	if err != nil {
		t.Fatal(err)
	}
	s2 := string(ext2)
	if !strings.Contains(s2, `"bookmarkX"`) {
		t.Fatalf("expected after-ID bookmark: %s", s2)
	}
}
