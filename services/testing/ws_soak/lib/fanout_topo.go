package soaklib

import (
	"fmt"
	"strings"

	"eve-industry-planner/shared/wsplacement"
)

const (
	defaultFanoutAllianceBase   int64 = 910001
	defaultFanoutAffiliatedCorp int64 = 920001
	defaultFanoutStandaloneCorp int64 = 930001
)

type fanoutMsgKind string

const (
	fanoutMsgAccount             fanoutMsgKind = "account"
	fanoutMsgCorpFull            fanoutMsgKind = "corp_full"
	fanoutMsgCorpDownAccount     fanoutMsgKind = "corp_down_account"
	fanoutMsgAllianceFull        fanoutMsgKind = "alliance_full"
	fanoutMsgAllianceDownCorp    fanoutMsgKind = "alliance_down_corp"
	fanoutMsgAllianceDownAccount fanoutMsgKind = "alliance_down_account"
)

// Rotating collection names so JetStream subjects / filters see varied doc paths.
var fanoutCollections = []string{
	"jobs", "assets", "fits", "industry", "markets", "contracts", "structures", "soakFanout",
}

// fanoutJob is one stamped publish with exact expected receiver accounts.
type fanoutJob struct {
	Kind                fanoutMsgKind
	DocID               string
	Collection          string
	TenantString        string
	AccountID           string
	CorporationRef      string
	AllianceID          string
	ScopeAccountIDs     []string
	ScopeCorporationIDs []string
	ExpectAccounts      []string
	Expect              int // len(ExpectAccounts); kept for summaries
}

type fanoutCorp struct {
	ID         int64
	AllianceID int64 // 0 = standalone (not in an alliance)
	Members    []clientIdentity
}

type fanoutAlliance struct {
	ID    int64
	Corps []int64
}

type fanoutTopology struct {
	Solo      []clientIdentity
	Corps     []fanoutCorp
	Alliances []fanoutAlliance
	All       []clientIdentity

	corpByID map[int64]*fanoutCorp
}

func (t fanoutTopology) corpMembers(corpID int64) []clientIdentity {
	if c := t.corpByID[corpID]; c != nil {
		return c.Members
	}
	return nil
}

func (t fanoutTopology) allianceMembers(allianceID int64) []clientIdentity {
	var out []clientIdentity
	for _, a := range t.Alliances {
		if a.ID != allianceID {
			continue
		}
		for _, corpID := range a.Corps {
			out = append(out, t.corpMembers(corpID)...)
		}
	}
	return out
}

func (t fanoutTopology) allianceCorps(allianceID int64) []fanoutCorp {
	var out []fanoutCorp
	for _, a := range t.Alliances {
		if a.ID != allianceID {
			continue
		}
		for _, corpID := range a.Corps {
			if c := t.corpByID[corpID]; c != nil {
				out = append(out, *c)
			}
		}
	}
	return out
}

func (t fanoutTopology) standaloneCorps() []fanoutCorp {
	var out []fanoutCorp
	for _, c := range t.Corps {
		if c.AllianceID == 0 {
			out = append(out, c)
		}
	}
	return out
}

func (t fanoutTopology) affiliatedCorps() []fanoutCorp {
	var out []fanoutCorp
	for _, c := range t.Corps {
		if c.AllianceID != 0 {
			out = append(out, c)
		}
	}
	return out
}

func (t fanoutTopology) orgClientCount() int {
	n := 0
	for _, id := range t.All {
		if id.CorpID != 0 || id.AllianceID != 0 {
			n++
		}
	}
	return n
}

func (t fanoutTopology) summary() string {
	return fmt.Sprintf("solo=%d alliances=%d corps=%d (affiliated=%d standalone=%d)",
		len(t.Solo), len(t.Alliances), len(t.Corps), len(t.affiliatedCorps()), len(t.standaloneCorps()))
}

// buildFanoutTopology builds a mixed graph:
//   - solo accounts (no org)
//   - standalone corps (corp scope, no alliance)
//   - multiple alliances each with several corps of varying sizes
//
// Total clients scale from -clients. allianceBase/corpBase/standaloneBase are id starts (0 = defaults).
func buildFanoutTopology(clients int, allianceBase, corpBase, standaloneBase int64) (fanoutTopology, error) {
	if clients < 24 {
		clients = 24
	}
	if allianceBase == 0 {
		allianceBase = defaultFanoutAllianceBase
	}
	if corpBase == 0 {
		corpBase = defaultFanoutAffiliatedCorp
	}
	if standaloneBase == 0 {
		standaloneBase = defaultFanoutStandaloneCorp
	}
	if corpBase == standaloneBase {
		return fanoutTopology{}, fmt.Errorf("fanout: affiliated and standalone corp id bases must differ")
	}

	// ~15% solo, ~25% standalone-corp, ~60% alliance-affiliated (adjust if floors force growth).
	soloN := max(clients*15/100, 8)
	standN := max(clients*25/100, 12)
	affN := clients - soloN - standN
	if affN < 16 {
		affN = 16
		clients = soloN + standN + affN
	}

	topo := fanoutTopology{corpByID: map[int64]*fanoutCorp{}}
	next := 0
	addMembers := func(n int, corpID, allID int64) []clientIdentity {
		out := make([]clientIdentity, 0, n)
		for i := 0; i < n; i++ {
			next++
			acct := fmt.Sprintf("soak-fanout-acct-%d", next)
			id := clientIdentity{
				Index:      next - 1,
				AccountID:  acct,
				SessionID:  fmt.Sprintf("soak-fanout-sess-%d", next),
				CorpID:     corpID,
				AllianceID: allID,
				Affinity:   wsplacement.TenantKeyAccount(acct),
				Cohort:     cohortGroup,
			}
			out = append(out, id)
			topo.All = append(topo.All, id)
		}
		return out
	}

	// Solos.
	topo.Solo = addMembers(soloN, 0, 0)

	// Standalone corps — varying sizes, not in any alliance.
	standSizes := []int{1, 2, 3, 5, 8, 12, 4, 6, 10}
	remain := standN
	standIdx := 0
	for remain > 0 {
		sz := standSizes[standIdx%len(standSizes)]
		standIdx++
		if sz > remain {
			sz = remain
		}
		corpID := standaloneBase + int64(standIdx)
		members := addMembers(sz, corpID, 0)
		topo.Corps = append(topo.Corps, fanoutCorp{ID: corpID, AllianceID: 0, Members: members})
		remain -= sz
	}

	// Alliances — count scales with client budget; each gets several corps of mixed sizes.
	allianceCount := max(clients/60, 2)
	if allianceCount > 12 {
		allianceCount = 12
	}
	affSizes := []int{2, 3, 4, 6, 8, 10, 5, 12, 7, 15}
	perAlliance := make([]int, allianceCount)
	base := affN / allianceCount
	extra := affN % allianceCount
	for i := range perAlliance {
		perAlliance[i] = base
		if i < extra {
			perAlliance[i]++
		}
		if perAlliance[i] < 4 {
			perAlliance[i] = 4
		}
	}
	// Re-normalize if floors grew past affN (rare); accept slightly more clients.
	corpIdx := 0
	sizeIdx := 0
	for ai := 0; ai < allianceCount; ai++ {
		allID := allianceBase + int64(ai)
		a := fanoutAlliance{ID: allID}
		remain = perAlliance[ai]
		corpsInAlliance := 0
		for remain > 0 {
			sz := affSizes[sizeIdx%len(affSizes)]
			sizeIdx++
			if sz > remain {
				sz = remain
			}
			// Prefer at least 2 corps per alliance when budget allows.
			if corpsInAlliance == 0 && remain > sz && remain-sz < 2 {
				sz = remain - 2
				if sz < 1 {
					sz = remain
				}
			}
			corpIdx++
			corpID := corpBase + int64(corpIdx)
			members := addMembers(sz, corpID, allID)
			topo.Corps = append(topo.Corps, fanoutCorp{ID: corpID, AllianceID: allID, Members: members})
			a.Corps = append(a.Corps, corpID)
			corpsInAlliance++
			remain -= sz
		}
		if len(a.Corps) == 0 {
			return fanoutTopology{}, fmt.Errorf("fanout: alliance %d has no corps", allID)
		}
		topo.Alliances = append(topo.Alliances, a)
	}

	topo.reindexCorps()
	if len(topo.Solo) == 0 || len(topo.Corps) == 0 || len(topo.Alliances) == 0 {
		return fanoutTopology{}, fmt.Errorf("fanout: incomplete topology")
	}
	if len(topo.standaloneCorps()) == 0 {
		return fanoutTopology{}, fmt.Errorf("fanout: need at least one standalone corp")
	}
	return topo, nil
}

func (t *fanoutTopology) reindexCorps() {
	t.corpByID = make(map[int64]*fanoutCorp, len(t.Corps))
	for i := range t.Corps {
		t.corpByID[t.Corps[i].ID] = &t.Corps[i]
	}
}

// buildFanoutJobs rotates message kinds across many accounts / corps / alliances (+ downward).
func buildFanoutJobs(topo fanoutTopology, messages int) ([]fanoutJob, error) {
	if messages < 1 {
		messages = 100
	}
	if err := topo.validateForJobs(); err != nil {
		return nil, err
	}

	kinds := []fanoutMsgKind{
		fanoutMsgAccount,
		fanoutMsgCorpFull,
		fanoutMsgCorpDownAccount,
		fanoutMsgAllianceFull,
		fanoutMsgAllianceDownCorp,
		fanoutMsgAllianceDownAccount,
	}

	out := make([]fanoutJob, 0, messages)
	for i := 0; i < messages; i++ {
		kind := kinds[i%len(kinds)]
		coll := fanoutCollections[i%len(fanoutCollections)]
		docID := fmt.Sprintf("soak-fanout-%s-%s-%d", kind, coll, i+1)
		job, err := makeFanoutJob(topo, kind, docID, coll, i)
		if err != nil {
			return nil, err
		}
		out = append(out, job)
	}
	return out, nil
}

func (t fanoutTopology) validateForJobs() error {
	if len(t.All) == 0 || len(t.Solo) == 0 {
		return fmt.Errorf("fanout: incomplete topology (need solos)")
	}
	if len(t.Corps) == 0 || len(t.Alliances) == 0 {
		return fmt.Errorf("fanout: incomplete topology (need corps+alliances)")
	}
	if len(t.standaloneCorps()) == 0 {
		return fmt.Errorf("fanout: incomplete topology (need standalone corps)")
	}
	return nil
}

func makeFanoutJob(topo fanoutTopology, kind fanoutMsgKind, docID, collection string, i int) (fanoutJob, error) {
	if collection == "" {
		collection = soakFanoutCollection
	}
	switch kind {
	case fanoutMsgAccount:
		// Mix solo + org-member account-level docs.
		id := topo.All[i%len(topo.All)]
		if i%3 == 0 {
			id = topo.Solo[i%len(topo.Solo)]
		}
		return fanoutJob{
			Kind:           kind,
			DocID:          docID,
			Collection:     collection,
			TenantString:   wsplacement.TenantKeyAccount(id.AccountID),
			AccountID:      id.AccountID,
			ExpectAccounts: []string{id.AccountID},
			Expect:         1,
		}, nil

	case fanoutMsgCorpFull:
		corp := topo.Corps[i%len(topo.Corps)]
		accts := memberAccountIDs(corp.Members)
		return fanoutJob{
			Kind:           kind,
			DocID:          docID,
			Collection:     collection,
			TenantString:   wsplacement.TenantKeyCorporation(CorporationRef(corp.ID)),
			CorporationRef: fmt.Sprintf("%d", corp.ID),
			ExpectAccounts: accts,
			Expect:         len(accts),
		}, nil

	case fanoutMsgCorpDownAccount:
		// Prefer larger corps so downward filter is meaningful; include standalone + affiliated.
		corp := pickCorpForDownAccount(topo, i)
		n := max(len(corp.Members)/2, 1)
		if n > len(corp.Members) {
			n = len(corp.Members)
		}
		// Rotate which half for variety.
		start := (i / len(topo.Corps)) % max(len(corp.Members)-n+1, 1)
		scope := make([]string, 0, n)
		for _, m := range corp.Members[start : start+n] {
			scope = append(scope, m.AccountID)
		}
		return fanoutJob{
			Kind:            kind,
			DocID:           docID,
			Collection:      collection,
			TenantString:    wsplacement.TenantKeyCorporation(CorporationRef(corp.ID)),
			CorporationRef:  fmt.Sprintf("%d", corp.ID),
			ScopeAccountIDs: scope,
			ExpectAccounts:  append([]string{}, scope...),
			Expect:          len(scope),
		}, nil

	case fanoutMsgAllianceFull:
		a := topo.Alliances[i%len(topo.Alliances)]
		accts := memberAccountIDs(topo.allianceMembers(a.ID))
		return fanoutJob{
			Kind:           kind,
			DocID:          docID,
			Collection:     collection,
			TenantString:   wsplacement.TenantKeyAlliance(AllianceRef(a.ID)),
			AllianceID:     fmt.Sprintf("%d", a.ID),
			ExpectAccounts: accts,
			Expect:         len(accts),
		}, nil

	case fanoutMsgAllianceDownCorp:
		a := topo.Alliances[i%len(topo.Alliances)]
		corps := topo.allianceCorps(a.ID)
		if len(corps) == 0 {
			return fanoutJob{}, fmt.Errorf("alliance %d has no corps", a.ID)
		}
		corp := corps[i%len(corps)]
		accts := memberAccountIDs(corp.Members)
		return fanoutJob{
			Kind:                kind,
			DocID:               docID,
			Collection:          collection,
			TenantString:        wsplacement.TenantKeyAlliance(AllianceRef(a.ID)),
			AllianceID:          fmt.Sprintf("%d", a.ID),
			ScopeCorporationIDs: []string{fmt.Sprintf("%d", corp.ID)},
			ExpectAccounts:      accts,
			Expect:              len(accts),
		}, nil

	case fanoutMsgAllianceDownAccount:
		a := topo.Alliances[i%len(topo.Alliances)]
		scope, err := pickAllianceDownAccounts(topo, a, i)
		if err != nil {
			return fanoutJob{}, err
		}
		return fanoutJob{
			Kind:            kind,
			DocID:           docID,
			Collection:      collection,
			TenantString:    wsplacement.TenantKeyAlliance(AllianceRef(a.ID)),
			AllianceID:      fmt.Sprintf("%d", a.ID),
			ScopeAccountIDs: scope,
			ExpectAccounts:  append([]string{}, scope...),
			Expect:          len(scope),
		}, nil
	}
	return fanoutJob{}, fmt.Errorf("unknown fanout kind %q", kind)
}

func pickCorpForDownAccount(topo fanoutTopology, i int) fanoutCorp {
	// Prefer corps with ≥2 members; fall back to any.
	var rich []fanoutCorp
	for _, c := range topo.Corps {
		if len(c.Members) >= 2 {
			rich = append(rich, c)
		}
	}
	if len(rich) > 0 {
		return rich[i%len(rich)]
	}
	return topo.Corps[i%len(topo.Corps)]
}

func pickAllianceDownAccounts(topo fanoutTopology, a fanoutAlliance, i int) ([]string, error) {
	corps := topo.allianceCorps(a.ID)
	if len(corps) == 0 {
		return nil, fmt.Errorf("alliance %d has no corps", a.ID)
	}
	if len(corps) >= 2 {
		c0 := corps[i%len(corps)]
		c1 := corps[(i+1)%len(corps)]
		m0 := c0.Members[i%len(c0.Members)]
		m1 := c1.Members[(i+1)%len(c1.Members)]
		return []string{m0.AccountID, m1.AccountID}, nil
	}
	members := corps[0].Members
	if len(members) == 1 {
		return []string{members[0].AccountID}, nil
	}
	a0 := members[i%len(members)]
	a1 := members[(i+1)%len(members)]
	return []string{a0.AccountID, a1.AccountID}, nil
}

func fanoutExpectTotal(jobs []fanoutJob) int {
	n := 0
	for _, j := range jobs {
		n += j.Expect
	}
	return n
}

func memberAccountIDs(members []clientIdentity) []string {
	out := make([]string, 0, len(members))
	for _, m := range members {
		if id := strings.TrimSpace(m.AccountID); id != "" {
			out = append(out, id)
		}
	}
	return out
}
