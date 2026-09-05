package soaklib

import (
	"eve-industry-planner/shared/models"
	"fmt"
)

const (
	defaultGroups    = 12
	defaultGroupSize = 10
)

// pressurePlan sizes a combined multi-group hold + soft/hard divert soak.
// Sticky groups (account/corp/alliance) stay connected while a fill corp is
// driven through target → cutoff; mixed keys assert divert / hard-skip.
type pressurePlan struct {
	ExpectTarget     int
	ExpectCutoff     int
	Groups           int
	GroupSize        int
	FillHolders      int
	SoftDivert       int
	FullProbes       int
	Clients          int
	FillCorpID       int64
	MinDivertRatio   float64
	ReconnectHolders bool
	ReconnectProbes  bool
	ReconnectGroups  bool
}

func buildPressurePlan(expectTarget, expectCutoff, clients, groups, groupSize, softDivert, fullProbes int, fillCorpID int64, minDivertRatio float64) (pressurePlan, error) {
	if expectTarget < 1 {
		return pressurePlan{}, fmt.Errorf("pressure: -expect-target must be >= 1 (got %d)", expectTarget)
	}
	if expectCutoff < expectTarget {
		return pressurePlan{}, fmt.Errorf("pressure: -expect-cutoff (%d) must be >= -expect-target (%d)", expectCutoff, expectTarget)
	}
	if groups < 1 {
		groups = defaultGroups
	}
	if groupSize < 1 {
		groupSize = defaultGroupSize
	}
	fill := expectCutoff
	if softDivert < 1 {
		softDivert = max(expectTarget/2, 12)
	}
	if fullProbes < 1 {
		fullProbes = max(expectCutoff/4, 10)
	}
	if fillCorpID == 0 {
		fillCorpID = defaultFillCorpID
	}
	if minDivertRatio <= 0 {
		minDivertRatio = 0.8
	}
	if minDivertRatio > 1 {
		return pressurePlan{}, fmt.Errorf("pressure: -min-divert-ratio must be <= 1")
	}

	fixed := fill + softDivert + fullProbes
	minTotal := groups*groupSize + fixed
	if clients > 0 {
		if clients < minTotal {
			return pressurePlan{}, fmt.Errorf("pressure: -clients (%d) < groups*group-size+fill+divert+probe (%d); raise -clients or shrink -groups/-group-size", clients, minTotal)
		}
		// Grow sticky group size so total matches -clients (extras land in groups).
		wantGroupClients := clients - fixed
		groupSize = max((wantGroupClients+groups-1)/groups, 1)
	}

	total := groups*groupSize + fixed
	return pressurePlan{
		ExpectTarget:     expectTarget,
		ExpectCutoff:     expectCutoff,
		Groups:           groups,
		GroupSize:        groupSize,
		FillHolders:      fill,
		SoftDivert:       softDivert,
		FullProbes:       fullProbes,
		Clients:          total,
		FillCorpID:       fillCorpID,
		MinDivertRatio:   minDivertRatio,
		ReconnectHolders: true,
		ReconnectProbes:  false,
		ReconnectGroups:  true,
	}, nil
}

// buildPressureIdentities builds unique login accounts throughout (avoids
// per-account connection caps) plus:
//   - group: Groups sticky keys (rotating account|corp|alliance), GroupSize each
//   - fill: shared FillCorpID (pressure pile for soft/full)
//   - soft_divert / full_probe: unique mixed keys (place misses)
func buildPressureIdentities(p pressurePlan) ([]clientIdentity, error) {
	if p.Groups < 1 || p.GroupSize < 1 || p.FillHolders < 1 {
		return nil, fmt.Errorf("pressure: groups, group-size, and fill must be >= 1")
	}
	total := p.Groups*p.GroupSize + p.FillHolders + p.SoftDivert + p.FullProbes
	out := make([]clientIdentity, 0, total)
	sess := 0
	next := func(cohort cohortKind, accountID, affinity string, corpID, allianceID int64) clientIdentity {
		sess++
		return clientIdentity{
			Index:      sess - 1,
			AccountID:  accountID,
			SessionID:  fmt.Sprintf("soak-sess-%d", sess),
			Affinity:   affinity,
			CorpID:     corpID,
			AllianceID: allianceID,
			Cohort:     cohort,
		}
	}

	const (
		groupCorpBase     int64 = 940000
		groupAllianceBase int64 = 950000
	)
	for g := range p.Groups {
		var aff string
		var corpID, allianceID int64
		switch g % 3 {
		case 0:
			aff = models.AccountOwner(fmt.Sprintf("soak-group-acct-%d", g+1)).Key()
		case 1:
			corpID = groupCorpBase + int64(g+1)
			aff = models.Owner{Kind: models.OwnerCorporation, ID: CorporationRef(corpID)}.Key()
		default:
			allianceID = groupAllianceBase + int64(g+1)
			aff = models.Owner{Kind: models.OwnerAlliance, ID: AllianceRef(allianceID)}.Key()
		}
		for i := range p.GroupSize {
			member := fmt.Sprintf("soak-group-%d-m-%d", g+1, i+1)
			out = append(out, next(cohortGroup, member, aff, corpID, allianceID))
		}
	}

	fillAff := models.Owner{Kind: models.OwnerCorporation, ID: CorporationRef(p.FillCorpID)}.Key()
	for i := range p.FillHolders {
		acct := fmt.Sprintf("soak-fill-%d", i+1)
		out = append(out, next(cohortFill, acct, fillAff, p.FillCorpID, 0))
	}

	addMixed := func(n int, cohort cohortKind, acctPrefix string, corpBase, allianceBase int64) {
		for i := range n {
			acct := fmt.Sprintf("%s-%d", acctPrefix, i+1)
			switch i % 3 {
			case 0:
				out = append(out, next(cohort, acct, models.AccountOwner(acct).Key(), 0, 0))
			case 1:
				corp := corpBase + int64(i+1)
				out = append(out, next(cohort, acct, models.Owner{Kind: models.OwnerCorporation, ID: CorporationRef(corp)}.Key(), corp, 0))
			default:
				alliance := allianceBase + int64(i+1)
				out = append(out, next(cohort, acct, models.Owner{Kind: models.OwnerAlliance, ID: AllianceRef(alliance)}.Key(), 0, alliance))
			}
		}
	}
	addMixed(p.SoftDivert, cohortSoftDivert, "soak-softdiv", defaultDivertCorpBase, defaultDivertAllianceBase)
	addMixed(p.FullProbes, cohortFullProbe, "soak-fullprobe", defaultDivertCorpBase+100000, defaultDivertAllianceBase+100000)
	return out, nil
}
