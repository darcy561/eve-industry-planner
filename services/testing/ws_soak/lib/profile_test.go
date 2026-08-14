package soaklib

import (
	"testing"

	"eve-industry-planner/shared/wsplacement"
)

func TestParseProfile(t *testing.T) {
	for _, want := range []Profile{ProfileHold, ProfileLimits, ProfilePressure, ProfileFanout} {
		got, err := ParseProfile(string(want))
		if err != nil || got != want {
			t.Fatalf("%q: got %q err=%v", want, got, err)
		}
	}
	if _, err := ParseProfile("nope"); err == nil {
		t.Fatal("expected error")
	}
}

func TestBuildLimitsPlanDefaults(t *testing.T) {
	p, err := buildLimitsPlan(20, 40, 0, 0, 0, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if p.FillHolders != 40 || p.SoftDivert != 12 || p.FullProbes != 10 {
		t.Fatalf("fill=%d soft=%d full=%d", p.FillHolders, p.SoftDivert, p.FullProbes)
	}
	if p.Clients != 62 || p.FillCorpID != defaultFillCorpID || p.MinDivertRatio != 0.8 {
		t.Fatalf("clients=%d corp=%d ratio=%v", p.Clients, p.FillCorpID, p.MinDivertRatio)
	}
}

func TestBuildLimitsIdentitiesMixed(t *testing.T) {
	ids, err := buildLimitsIdentities(4, 6, 3, defaultFillCorpID)
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 13 {
		t.Fatalf("len=%d", len(ids))
	}
	fill := filterCohort(ids, cohortFill)
	if len(fill) != 4 {
		t.Fatalf("fill=%d", len(fill))
	}
	wantFill := wsplacement.TenantKeyCorporation("910001")
	seenAcct := map[string]bool{}
	for _, id := range fill {
		if id.Affinity != wantFill {
			t.Fatalf("fill aff=%q", id.Affinity)
		}
		if seenAcct[id.AccountID] {
			t.Fatalf("duplicate fill account %s", id.AccountID)
		}
		seenAcct[id.AccountID] = true
	}
	mixed := append(filterCohort(ids, cohortSoftDivert), filterCohort(ids, cohortFullProbe)...)
	a, c, al := countAffinityKinds(mixed)
	if a == 0 || c == 0 || al == 0 {
		t.Fatalf("mixed kinds account=%d corp=%d alliance=%d", a, c, al)
	}
	affSeen := map[string]bool{}
	for _, id := range mixed {
		if affSeen[id.Affinity] {
			t.Fatalf("duplicate mixed affinity %s", id.Affinity)
		}
		affSeen[id.Affinity] = true
	}
}

func TestUniqueSorted(t *testing.T) {
	got := uniqueSorted([]string{"b", "a", "b", " ", "a"})
	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("got %#v", got)
	}
}

func TestCountOnOff(t *testing.T) {
	on, off, total := countOnOff(map[string]uint64{"websocket-1": 2, "websocket-2": 8}, []string{"websocket-1"})
	if on != 2 || off != 8 || total != 10 {
		t.Fatalf("on=%d off=%d total=%d", on, off, total)
	}
}

func TestLimitsEvidenceAssertDivert(t *testing.T) {
	ok := limitsEvidence{
		SoftSeen: true, FullSeen: true, ConnectedOK: 20, ExpectTarget: 20, ExpectCutoff: 40,
		SoftDivertTotal: 10, SoftDivertOffSoft: 9, SoftDivertOnSoft: 1, MinDivertRatio: 0.8,
		FullProbeTotal: 5, FullProbeOffFull: 5,
		RequireColoc: true, FillSlotCounts: map[string]uint64{"abc": 40},
	}
	if err := ok.assert(); err != nil {
		t.Fatal(err)
	}
	badSoft := ok
	badSoft.SoftDivertOffSoft = 1
	badSoft.SoftDivertOnSoft = 9
	if err := badSoft.assert(); err == nil {
		t.Fatal("want soft divert ratio error")
	}
	badFull := ok
	badFull.FullProbeOnFull = 1
	badFull.FullProbeOffFull = 4
	if err := badFull.assert(); err == nil {
		t.Fatal("want full probe error")
	}
	badColoc := ok
	badColoc.FillSlotCounts = map[string]uint64{"a": 20, "b": 20}
	if err := badColoc.assert(); err == nil {
		t.Fatal("want fill coloc split error")
	}
}

func TestAssertNoColocSplits(t *testing.T) {
	ok := map[string]map[string]uint64{
		"corporation:1": {"c1": 10},
		"account:a":     {"c2": 2},
	}
	if err := assertSharedOrgAffinityColoc(map[string]map[string]uint64{
		"corporation:1": {"a": 3, "b": 1},
	}); err == nil {
		t.Fatal("expected shared org coloc failure")
	}
	if err := assertSharedOrgAffinityColoc(map[string]map[string]uint64{
		"corporation:1": {"a": 4},
		"alliance:9":    {"a": 2},
		"account:solo":  {"a": 1, "b": 1}, // ignored — not org key
	}); err != nil {
		t.Fatalf("shared org coloc ok: %v", err)
	}

	if err := assertNoColocSplits(ok); err != nil {
		t.Fatal(err)
	}
	bad := map[string]map[string]uint64{
		"corporation:1": {"c1": 8, "c2": 2},
	}
	if err := assertNoColocSplits(bad); err == nil {
		t.Fatal("want split error")
	}
}

func TestRecordAffinityPlaceTracksSplits(t *testing.T) {
	st := newStats()
	st.recordAffinityPlace(cohortFill, "corporation:1", "c1")
	st.recordAffinityPlace(cohortFill, "corporation:1", "c1")
	st.recordAffinityPlace(cohortFill, "corporation:1", "c2")
	homes := st.affinityHomeSets()
	if got := homes["corporation:1"]; len(got) != 2 || got["c1"] != 2 || got["c2"] != 1 {
		t.Fatalf("homes=%v", got)
	}
	if err := assertNoColocSplits(homes); err == nil {
		t.Fatal("want split")
	}
}
