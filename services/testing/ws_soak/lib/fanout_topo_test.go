package soaklib

import (
	"testing"

	"eve-industry-planner/shared/wsplacement"
)

func TestBuildFanoutTopologyMixedGraph(t *testing.T) {
	topo, err := buildFanoutTopology(200, 0, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(topo.Solo) < 8 {
		t.Fatalf("solo=%d", len(topo.Solo))
	}
	if len(topo.Alliances) < 2 {
		t.Fatalf("alliances=%d", len(topo.Alliances))
	}
	if len(topo.standaloneCorps()) < 2 {
		t.Fatalf("standalone=%d", len(topo.standaloneCorps()))
	}
	if len(topo.affiliatedCorps()) < 4 {
		t.Fatalf("affiliated=%d", len(topo.affiliatedCorps()))
	}
	if len(topo.All) < 200 {
		t.Fatalf("clients=%d want >=200", len(topo.All))
	}

	for _, id := range topo.Solo {
		if id.CorpID != 0 || id.AllianceID != 0 {
			t.Fatalf("solo has org: %+v", id)
		}
		if id.Affinity != wsplacement.TenantKeyAccount(id.AccountID) {
			t.Fatalf("solo aff=%q", id.Affinity)
		}
	}
	for _, c := range topo.standaloneCorps() {
		if c.AllianceID != 0 {
			t.Fatalf("standalone corp has alliance: %+v", c)
		}
		for _, m := range c.Members {
			if m.AllianceID != 0 || m.CorpID != c.ID {
				t.Fatalf("standalone member %+v", m)
			}
		}
	}
	for _, a := range topo.Alliances {
		members := topo.allianceMembers(a.ID)
		if len(members) < 4 || len(a.Corps) < 1 {
			t.Fatalf("alliance %d corps=%d members=%d", a.ID, len(a.Corps), len(members))
		}
		for _, m := range members {
			if m.AllianceID != a.ID {
				t.Fatalf("member alliance %+v want %d", m, a.ID)
			}
		}
	}
	seenAcct := map[string]bool{}
	seenCorp := map[int64]bool{}
	seenAll := map[int64]bool{}
	for _, id := range topo.All {
		if seenAcct[id.AccountID] {
			t.Fatalf("dup account %s", id.AccountID)
		}
		seenAcct[id.AccountID] = true
	}
	for _, c := range topo.Corps {
		if seenCorp[c.ID] {
			t.Fatalf("dup corp %d", c.ID)
		}
		seenCorp[c.ID] = true
	}
	for _, a := range topo.Alliances {
		if seenAll[a.ID] {
			t.Fatalf("dup alliance %d", a.ID)
		}
		seenAll[a.ID] = true
	}
}

func TestBuildFanoutTopologySmallFloor(t *testing.T) {
	topo, err := buildFanoutTopology(10, 11, 21, 31)
	if err != nil {
		t.Fatal(err)
	}
	if len(topo.All) < 24 {
		t.Fatalf("floor clients=%d", len(topo.All))
	}
	if topo.Alliances[0].ID != 11 {
		t.Fatalf("alliance base=%d", topo.Alliances[0].ID)
	}
	if len(topo.affiliatedCorps()) == 0 || topo.affiliatedCorps()[0].ID < 21 {
		t.Fatalf("corp base=%v", topo.affiliatedCorps())
	}
	if topo.standaloneCorps()[0].ID < 31 {
		t.Fatalf("standalone base=%d", topo.standaloneCorps()[0].ID)
	}
}

func TestBuildFanoutJobsKindsVarietyAndExpect(t *testing.T) {
	topo, err := buildFanoutTopology(80, 0, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	jobs, err := buildFanoutJobs(topo, 48)
	if err != nil {
		t.Fatal(err)
	}
	if len(jobs) != 48 {
		t.Fatalf("jobs=%d", len(jobs))
	}
	seenKind := map[fanoutMsgKind]bool{}
	seenColl := map[string]bool{}
	seenCorp := map[string]bool{}
	seenAlliance := map[string]bool{}
	seenAcct := map[string]bool{}
	for _, j := range jobs {
		seenKind[j.Kind] = true
		seenColl[j.Collection] = true
		if j.Expect < 1 || j.DocID == "" || j.TenantString == "" || j.Collection == "" {
			t.Fatalf("bad job %+v", j)
		}
		switch j.Kind {
		case fanoutMsgAccount:
			if j.AccountID == "" || j.Expect != 1 || len(j.ExpectAccounts) != 1 {
				t.Fatalf("account %+v", j)
			}
			seenAcct[j.AccountID] = true
		case fanoutMsgCorpFull:
			if j.CorporationID == "" || j.Expect != len(topo.corpMembers(mustInt64(j.CorporationID))) || len(j.ExpectAccounts) != j.Expect {
				t.Fatalf("corp_full %+v", j)
			}
			seenCorp[j.CorporationID] = true
		case fanoutMsgCorpDownAccount:
			if len(j.ScopeAccountIDs) == 0 || j.Expect != len(j.ScopeAccountIDs) || len(j.ExpectAccounts) != j.Expect {
				t.Fatalf("corp_down %+v", j)
			}
			seenCorp[j.CorporationID] = true
		case fanoutMsgAllianceFull:
			if j.AllianceID == "" || j.Expect != len(topo.allianceMembers(mustInt64(j.AllianceID))) || len(j.ExpectAccounts) != j.Expect {
				t.Fatalf("alliance_full %+v", j)
			}
			seenAlliance[j.AllianceID] = true
		case fanoutMsgAllianceDownCorp:
			if len(j.ScopeCorporationIDs) != 1 || j.Expect < 1 || len(j.ExpectAccounts) != j.Expect {
				t.Fatalf("alliance_down_corp %+v", j)
			}
			seenAlliance[j.AllianceID] = true
		case fanoutMsgAllianceDownAccount:
			if len(j.ScopeAccountIDs) < 1 || j.Expect != len(j.ScopeAccountIDs) || len(j.ExpectAccounts) != j.Expect {
				t.Fatalf("alliance_down_account %+v", j)
			}
			seenAlliance[j.AllianceID] = true
		}
	}
	for _, k := range []fanoutMsgKind{
		fanoutMsgAccount, fanoutMsgCorpFull, fanoutMsgCorpDownAccount,
		fanoutMsgAllianceFull, fanoutMsgAllianceDownCorp, fanoutMsgAllianceDownAccount,
	} {
		if !seenKind[k] {
			t.Fatalf("missing kind %s", k)
		}
	}
	if len(seenColl) < 4 {
		t.Fatalf("collections=%d %v", len(seenColl), seenColl)
	}
	if len(seenCorp) < 3 {
		t.Fatalf("corps hit=%d", len(seenCorp))
	}
	if len(seenAlliance) < 2 {
		t.Fatalf("alliances hit=%d", len(seenAlliance))
	}
	// Corp set should include at least one standalone (93000x defaults).
	standHit := false
	for id := range seenCorp {
		c := topo.corpByID[mustInt64(id)]
		if c != nil && c.AllianceID == 0 {
			standHit = true
			break
		}
	}
	if !standHit {
		t.Fatal("expected at least one standalone corp job target")
	}
	if fanoutExpectTotal(jobs) < len(jobs) {
		t.Fatalf("expect total too small")
	}
}

func mustInt64(s string) int64 {
	var n int64
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int64(c-'0')
	}
	return n
}
