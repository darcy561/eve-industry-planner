package protectedfields

import (
	"testing"

	"eve-industry-planner/shared/crypto/entityid"
)

type doc struct {
	CorpID   int
	CorpRef  string
	CharID   int
	CharRef  string
	AllyID   int
	AllyRef  string
	Untagged int
}

var testDecl = Declaration[doc]{
	Spec: SpecJobFieldsV1,
	Targets: func(d *doc) []Target {
		return []Target{
			{Kind: KindCorp, ID: &d.CorpID, Ref: &d.CorpRef},
			{Kind: KindCharacter, ID: &d.CharID, Ref: &d.CharRef},
			{Kind: KindAlliance, ID: &d.AllyID, Ref: &d.AllyRef},
		}
	},
}

func testHelper(t *testing.T) *entityid.Cipher {
	t.Helper()
	h, err := entityid.New([]byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("entityid.New: %v", err)
	}
	return h
}

// All three entity kinds must convert, including alliance, which has no
// declaration using it yet.
func TestToRefsCoversEveryKind(t *testing.T) {
	d := &doc{CorpID: 98765432, CharID: 91234567, AllyID: 99000001}
	if err := Encrypt(testDecl, d, testHelper(t)); err != nil {
		t.Fatalf("ToRefs: %v", err)
	}

	for _, tc := range []struct {
		got  string
		kind string
	}{
		{d.CorpRef, entityid.KindCorp},
		{d.CharRef, entityid.KindCharacter},
		{d.AllyRef, entityid.KindAlliance},
	} {
		kind, ok := entityid.ParseKind(tc.got)
		if !ok || kind != tc.kind {
			t.Fatalf("ref %q parsed as (%q, %v), want kind %q", tc.got, kind, ok, tc.kind)
		}
	}
	if HasRawIDs(testDecl, d) {
		t.Fatal("no raw id may survive conversion")
	}
}

// A field not named in the declaration is not protected — which is the reason the
// declaration exists, and worth failing loudly about if that ever changes.
func TestUndeclaredFieldsAreUntouched(t *testing.T) {
	d := &doc{CorpID: 1, Untagged: 42}
	if err := Encrypt(testDecl, d, testHelper(t)); err != nil {
		t.Fatalf("ToRefs: %v", err)
	}
	if d.Untagged != 42 {
		t.Fatal("conversion touched a field the declaration does not name")
	}
}

func TestToRefsRejectsAnUnknownSpec(t *testing.T) {
	bad := Declaration[doc]{Spec: "nope", Targets: testDecl.Targets}
	if err := Encrypt(bad, &doc{CorpID: 1}, testHelper(t)); err == nil {
		t.Fatal("expected an error for an unallocated spec")
	}
}

// RefsForIDs is the query direction: hand it ids, compare the refs it returns.
func TestRefsForIDsMatchesConversion(t *testing.T) {
	h := testHelper(t)

	d := &doc{CorpID: 98765432}
	if err := Encrypt(testDecl, d, h); err != nil {
		t.Fatalf("ToRefs: %v", err)
	}

	got, err := ValuesForIDs(h, KindCorp, []int{98765432, 98765432, 0, -1})
	if err != nil {
		t.Fatalf("RefsForIDs: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("map = %v, want one entry with duplicates and non-positive ids dropped", got)
	}
	if got[98765432] != d.CorpRef {
		t.Fatalf("RefsForIDs gave %q, conversion gave %q", got[98765432], d.CorpRef)
	}
}
