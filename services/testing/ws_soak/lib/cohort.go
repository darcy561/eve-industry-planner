package soaklib

import (
	"fmt"

	"eve-industry-planner/shared/wsplacement"
)

type cohortKind string

const (
	cohortFill       cohortKind = "fill"
	cohortSoftDivert cohortKind = "soft_divert"
	cohortFullProbe  cohortKind = "full_probe"
	cohortGroup      cohortKind = "group" // pressure: sticky multi-client affinity groups
)

const (
	defaultFillCorpID         int64 = 910001
	defaultDivertCorpBase     int64 = 920000
	defaultDivertAllianceBase int64 = 930000
)

// buildLimitsIdentities builds:
//   - fill: unique accounts, shared corporation affinity (piles one place home to soft/full)
//   - soft_divert / full_probe: unique accounts with rotating account|corp|alliance keys
func buildLimitsIdentities(fillN, softDivertN, fullProbeN int, fillCorpID int64) ([]clientIdentity, error) {
	if fillN < 1 {
		return nil, fmt.Errorf("fill cohort must be >= 1")
	}
	if fillCorpID == 0 {
		fillCorpID = defaultFillCorpID
	}
	total := fillN + softDivertN + fullProbeN
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

	fillAff := wsplacement.TenantKeyCorporation(fmt.Sprintf("%d", fillCorpID))
	for i := range fillN {
		acct := fmt.Sprintf("soak-fill-%d", i+1)
		out = append(out, next(cohortFill, acct, fillAff, fillCorpID, 0))
	}

	addMixed := func(n int, cohort cohortKind, acctPrefix string, corpBase, allianceBase int64) {
		for i := range n {
			acct := fmt.Sprintf("%s-%d", acctPrefix, i+1)
			switch i % 3 {
			case 0:
				out = append(out, next(cohort, acct, wsplacement.TenantKeyAccount(acct), 0, 0))
			case 1:
				corp := corpBase + int64(i+1)
				out = append(out, next(cohort, acct, wsplacement.TenantKeyCorporation(fmt.Sprintf("%d", corp)), corp, 0))
			default:
				alliance := allianceBase + int64(i+1)
				out = append(out, next(cohort, acct, wsplacement.TenantKeyAlliance(fmt.Sprintf("%d", alliance)), 0, alliance))
			}
		}
	}
	// Separate org-id bands so soft_divert and full_probe never share a place key.
	addMixed(softDivertN, cohortSoftDivert, "soak-softdiv", defaultDivertCorpBase, defaultDivertAllianceBase)
	addMixed(fullProbeN, cohortFullProbe, "soak-fullprobe", defaultDivertCorpBase+100000, defaultDivertAllianceBase+100000)
	return out, nil
}

func filterCohort(ids []clientIdentity, cohort cohortKind) []clientIdentity {
	var out []clientIdentity
	for _, id := range ids {
		if id.Cohort == cohort {
			out = append(out, id)
		}
	}
	return out
}

func countAffinityKinds(ids []clientIdentity) (accounts, corps, alliances int) {
	for _, id := range ids {
		switch {
		case hasPrefix(id.Affinity, wsplacement.TenantPrefixAccount):
			accounts++
		case hasPrefix(id.Affinity, wsplacement.TenantPrefixCorporation):
			corps++
		case hasPrefix(id.Affinity, wsplacement.TenantPrefixAlliance):
			alliances++
		}
	}
	return accounts, corps, alliances
}

func hasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}
