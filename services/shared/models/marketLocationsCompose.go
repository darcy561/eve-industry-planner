package models

import (
	"cmp"
	"slices"
	"strconv"
)

// SharedMarketLocations are one owner's markets, as they reach the members of
// that corporation, alliance or planner.
type SharedMarketLocations struct {
	Owner     Owner
	Locations MarketLocations
}

// ComposeMarketLocations is what one reader may price against: their own
// markets, plus the ones each owner they belong to has shared.
//
// One place is one market however many owners saved it, because everything the
// price tier holds is keyed by the saved row's id — two rows naming one citadel
// would be two walks of the same structure for ever. Rows collapse by place: the
// reader's own wins, then the nearer owner, then the lower owner key so the
// answer does not depend on the order documents were read in. A row naming no
// place is left out.
func ComposeMarketLocations(own MarketLocations, shared []SharedMarketLocations) MarketLocations {
	composed := MarketLocations{}
	taken := map[string]bool{}

	for _, location := range own {
		place, placed := location.place()
		if !placed || taken[place] {
			continue
		}
		taken[place] = true
		composed = append(composed, location)
	}

	for _, owner := range nearestFirst(shared) {
		for _, location := range owner.Locations {
			place, placed := location.place()
			if !placed || taken[place] || !location.SharedWithMembers {
				continue
			}
			taken[place] = true

			// Named as the owner's rather than the reader's: a panel says where a
			// market came from, and the id alone cannot tell one they saved from
			// one that reached them.
			location.SharedBy = owner.Owner.Key()
			composed = append(composed, location)
		}
	}

	return composed
}

// place is what two rows have to agree on to be the same market, or false where
// the row names nowhere.
func (m MarketLocation) place() (string, bool) {
	switch {
	case m.StructureID != 0:
		return "structure:" + strconv.FormatInt(m.StructureID, 10), true
	case m.StationID != 0:
		return "station:" + strconv.FormatInt(m.StationID, 10), true
	default:
		return "", false
	}
}

// nearestFirst orders the owners a reader belongs to by how specific each is to
// them, so the first one to claim a place keeps it.
func nearestFirst(shared []SharedMarketLocations) []SharedMarketLocations {
	ordered := slices.Clone(shared)
	slices.SortStableFunc(ordered, func(a, b SharedMarketLocations) int {
		if byKind := cmp.Compare(nearness(a.Owner), nearness(b.Owner)); byKind != 0 {
			return byKind
		}
		return cmp.Compare(a.Owner.Key(), b.Owner.Key())
	})
	return ordered
}

func nearness(owner Owner) int {
	switch owner.Kind {
	case OwnerCorporation:
		return 0
	case OwnerAlliance:
		return 1
	default:
		return 2
	}
}
