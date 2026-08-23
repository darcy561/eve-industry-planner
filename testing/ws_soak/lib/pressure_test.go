package soaklib

import (
	"testing"

	"eve-industry-planner/shared/wsplacement"
)

func TestParseProfilePressure(t *testing.T) {
	got, err := ParseProfile("pressure")
	if err != nil || got != ProfilePressure {
		t.Fatalf("got %q err=%v", got, err)
	}
}

func TestBuildPressurePlanDefaults(t *testing.T) {
	p, err := buildPressurePlan(40, 80, 0, 0, 0, 0, 0, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if p.Groups != defaultGroups || p.GroupSize != defaultGroupSize {
		t.Fatalf("groups=%d size=%d", p.Groups, p.GroupSize)
	}
	if p.FillHolders != 80 || p.SoftDivert < 1 || p.FullProbes < 1 {
		t.Fatalf("fill=%d soft=%d full=%d", p.FillHolders, p.SoftDivert, p.FullProbes)
	}
	wantMin := p.Groups*p.GroupSize + p.FillHolders + p.SoftDivert + p.FullProbes
	if p.Clients != wantMin {
		t.Fatalf("clients=%d want %d", p.Clients, wantMin)
	}
}

func TestBuildPressurePlanScalesGroups(t *testing.T) {
	p, err := buildPressurePlan(20, 40, 400, 10, 5, 12, 10, 0, 0.8)
	if err != nil {
		t.Fatal(err)
	}
	// fixed = 40+12+10 = 62; group clients = 400-62 = 338 → size ceil 338/10 = 34
	if p.Groups != 10 || p.GroupSize != 34 {
		t.Fatalf("groups=%d size=%d", p.Groups, p.GroupSize)
	}
	if p.Clients != 10*34+40+12+10 {
		t.Fatalf("clients=%d", p.Clients)
	}
}

func TestBuildPressureIdentitiesMixedGroups(t *testing.T) {
	p := pressurePlan{
		Groups: 6, GroupSize: 3, FillHolders: 4, SoftDivert: 6, FullProbes: 3, FillCorpID: defaultFillCorpID,
	}
	ids, err := buildPressureIdentities(p)
	if err != nil {
		t.Fatal(err)
	}
	want := 6*3 + 4 + 6 + 3
	if len(ids) != want {
		t.Fatalf("len=%d want %d", len(ids), want)
	}
	groups := filterCohort(ids, cohortGroup)
	if len(groups) != 18 {
		t.Fatalf("groups=%d", len(groups))
	}
	// Each sticky key should appear GroupSize times.
	affCount := map[string]int{}
	for _, id := range groups {
		affCount[id.Affinity]++
	}
	if len(affCount) != 6 {
		t.Fatalf("affinity keys=%d want 6", len(affCount))
	}
	for aff, n := range affCount {
		if n != 3 {
			t.Fatalf("aff %s count=%d", aff, n)
		}
	}
	a, c, al := countAffinityKinds(groups)
	if a == 0 || c == 0 || al == 0 {
		t.Fatalf("group kinds account=%d corp=%d alliance=%d", a, c, al)
	}
	fill := filterCohort(ids, cohortFill)
	wantFill := wsplacement.TenantKeyCorporation(CorporationRef(910001))
	for _, id := range fill {
		if id.Affinity != wantFill {
			t.Fatalf("fill aff=%q", id.Affinity)
		}
	}
	seenAcct := map[string]bool{}
	for _, id := range ids {
		if seenAcct[id.AccountID] {
			t.Fatalf("duplicate account %s", id.AccountID)
		}
		seenAcct[id.AccountID] = true
	}
}
