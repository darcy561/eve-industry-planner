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
// **One place is one market, however many owners saved it.** Everything the
// price tier holds is keyed by the saved row's id — the prices, the character
// that read them, the market's next turn — so two rows naming one citadel are
// two turns on the rotation and two walks of the same structure on the reader's
// own token, an hour apart, for ever.
//
// So rows are collapsed by the place they name rather than by their id. The
// reader's own row wins outright: an inherited row supplies a market they have
// not saved, and never overrides one they have. Between two inherited rows the
// nearer owner wins — a reader is in a corporation that is in an alliance — and
// an equal pair is settled by the owner key, so the answer does not depend on
// the order the documents were read in.
//
// Two of the reader's own rows naming one place take the first in stored order.
// Nothing stops a reader saving one place twice today, so the answer is at least
// the same one every time rather than whichever row was reached first.
//
// A row naming no place is left out. It cannot be asked about, and offering it
// would put a market in front of a reader that no price could ever arrive for.
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
