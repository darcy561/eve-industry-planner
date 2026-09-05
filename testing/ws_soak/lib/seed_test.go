package soaklib

import (
	"eve-industry-planner/shared/models"
	"strings"
	"testing"
)

func TestParseAffinityMode(t *testing.T) {
	for _, want := range []affinityMode{affinityNone, affinityAccount, affinityCorp, affinityAlliance} {
		got, err := parseAffinityMode(string(want))
		if err != nil || got != want {
			t.Fatalf("mode %q: got %q err=%v", want, got, err)
		}
	}
	if _, err := parseAffinityMode("bogus"); err == nil {
		t.Fatal("expected error")
	}
}

func TestBuildIdentitiesAccountAffinity(t *testing.T) {
	ids, err := buildIdentities(5, 2, affinityAccount, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 5 {
		t.Fatalf("len=%d", len(ids))
	}
	if ids[0].AccountID != "soak-acct-1" || ids[1].AccountID != "soak-acct-2" || ids[2].AccountID != "soak-acct-1" {
		t.Fatalf("account distribution: %#v %#v %#v", ids[0].AccountID, ids[1].AccountID, ids[2].AccountID)
	}
	want := models.AccountOwner("soak-acct-1").Key()
	if ids[0].Affinity != want {
		t.Fatalf("affinity=%q want %q", ids[0].Affinity, want)
	}
	if !strings.HasPrefix(ids[0].SessionID, "soak-sess-") {
		t.Fatalf("session=%q", ids[0].SessionID)
	}
}

func TestBuildIdentitiesCorpRequiresID(t *testing.T) {
	if _, err := buildIdentities(1, 1, affinityCorp, 0, 0); err == nil {
		t.Fatal("expected corp id error")
	}
	ids, err := buildIdentities(2, 1, affinityCorp, 99, 0)
	if err != nil {
		t.Fatal(err)
	}
	want := models.Owner{Kind: models.OwnerCorporation, ID: CorporationRef(99)}.Key()
	if ids[0].Affinity != want || ids[1].Affinity != want {
		t.Fatalf("corp affinity: %#v", ids)
	}
}

func TestWSURLForSession(t *testing.T) {
	got, err := wsURLForSession("ws://ws-router:8080/ws", "sess-1")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "planner_session_id=sess-1") {
		t.Fatalf("got %q", got)
	}
}

func TestDropRate(t *testing.T) {
	st := newStats()
	if st.dropRate() != 1 {
		t.Fatalf("empty dropRate=%v", st.dropRate())
	}
	st.DialOK.Store(10)
	st.CloseUnexpected.Store(2)
	if st.dropRate() != 0.2 {
		t.Fatalf("dropRate=%v", st.dropRate())
	}
}
