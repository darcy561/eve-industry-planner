package models

import (
	"errors"
	"fmt"
	"strings"
)

// Limits on a saved market lane. A list this long is a mistake rather than a
// preference, and a name longer than this is not one a picker can show.
const (
	maxMarketLocations    = 200
	maxMarketLocationName = 120
)

// MaxBrokerFeePercent is the highest rate a citadel's owner can be charging.
//
// Exported because the SPA enforces it at the field: a reader who types past it
// builds a document every save is refused for, and the refusal reaches them as
// nothing but a figure that never sticks. `market_limits_parity_test.go` is what
// holds the two copies together.
const MaxBrokerFeePercent = 100

// Validate refuses a lane that would leave an owner with markets nothing can
// price, or with two rows a reader cannot tell apart.
//
// On the type rather than on either settings update, because both documents
// carry this lane and a row saved through either reaches the same pricing
// machinery. A rule written on one path is a rule the other does not have.
//
// What it does not check is whether the place exists: that is an ESI question,
// answered when the reader chose it, and asking it again here would make saving
// any setting depend on ESI being up.
func (m MarketLocations) Validate() error {
	if len(m) > maxMarketLocations {
		return fmt.Errorf("market locations: %d is more than the %d allowed", len(m), maxMarketLocations)
	}

	seen := make(map[string]bool, len(m))
	for _, location := range m {
		if err := location.validate(); err != nil {
			return err
		}
		if seen[location.ID] {
			return fmt.Errorf("market locations: id %q appears twice", location.ID)
		}
		seen[location.ID] = true
	}

	return nil
}

// validate is one market: what it must carry to be offered and asked about.
func (l MarketLocation) validate() error {
	id := strings.TrimSpace(l.ID)
	if id == "" {
		return errors.New("market locations: a market has no id")
	}
	if strings.TrimSpace(l.Name) == "" {
		return fmt.Errorf("market locations: market %q has no name", id)
	}
	if len(l.Name) > maxMarketLocationName {
		return fmt.Errorf("market locations: name for %q is longer than %d characters", id, maxMarketLocationName)
	}
	// An order book is read per region and then narrowed to the place, so a
	// market with no region is offered in every picker and prices nothing.
	if l.RegionID <= 0 {
		return fmt.Errorf("market locations: market %q names no region", id)
	}

	atStation := l.StationID != 0
	atStructure := l.StructureID != 0
	if atStation == atStructure {
		return fmt.Errorf("market locations: market %q must name a station or a structure, not neither or both", id)
	}
	// A station's fee comes from the seller's skills and standings, so a stored
	// one there would stand in for that derivation and quote a rate nobody is
	// charged.
	if atStation && l.BrokerFee != 0 {
		return fmt.Errorf("market locations: station market %q carries a broker fee", id)
	}
	if l.BrokerFee < 0 || l.BrokerFee > MaxBrokerFeePercent {
		return fmt.Errorf("market locations: broker fee for %q is not a percentage", id)
	}
	return nil
}
