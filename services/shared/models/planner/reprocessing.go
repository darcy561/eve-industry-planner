package planner

import (
	"errors"
	"fmt"
	"math"
	"slices"
)

// The compressed-ore choices a planner's ore selection takes, as the SPA names them.
const (
	CompressedOrePrefer = "prefer"
	CompressedOreAllow  = "allow"
	CompressedOreAvoid  = "avoid"
)

// The ways a planner charges shipping on ore it buys, as the SPA names them.
const (
	ShippingPerVolume = "perVolume"
	ShippingFixed     = "fixed"
)

// maxNeverChoose is a never-choose list long enough to be a mistake rather than a preference.
const maxNeverChoose = 2000

// ReprocessingSettings is how a planner chooses the ore it buys for minerals and what it counts
// against that ore.
type ReprocessingSettings struct {
	CompressedOre        string               `bson:"compressedOre" json:"compressedOre"`
	CountLeftoversAsSold bool                 `bson:"countLeftoversAsSold,omitempty" json:"countLeftoversAsSold,omitzero"`
	BuyOutright          bool                 `bson:"buyOutright,omitempty" json:"buyOutright,omitzero"`
	Shipping             ReprocessingShipping `bson:"shipping" json:"shipping"`
	NeverChoose          []int                `bson:"neverChoose" json:"neverChoose"`
}

// ReprocessingShipping is the shipping charged on ore bought, per m³ or as one amount; zero is none.
type ReprocessingShipping struct {
	Mode   string  `bson:"mode" json:"mode"`
	Amount float64 `bson:"amount,omitempty" json:"amount,omitzero"`
}

// DefaultReprocessingSettings returns the reprocessing settings a planner starts with.
func DefaultReprocessingSettings() ReprocessingSettings {
	return ReprocessingSettings{
		CompressedOre: CompressedOrePrefer,
		Shipping:      ReprocessingShipping{Mode: ShippingPerVolume},
		NeverChoose:   []int{},
	}
}

// Validate refuses reprocessing settings ore selection could not read.
func (s ReprocessingSettings) Validate() error {
	if !slices.Contains([]string{CompressedOrePrefer, CompressedOreAllow, CompressedOreAvoid}, s.CompressedOre) {
		return fmt.Errorf("reprocessing settings: compressed ore %q is not prefer, allow or avoid", s.CompressedOre)
	}
	if s.Shipping.Mode != ShippingPerVolume && s.Shipping.Mode != ShippingFixed {
		return fmt.Errorf("reprocessing settings: shipping mode %q is not perVolume or fixed", s.Shipping.Mode)
	}
	if s.Shipping.Amount < 0 || math.IsNaN(s.Shipping.Amount) || math.IsInf(s.Shipping.Amount, 0) {
		return errors.New("reprocessing settings: shipping amount must be a number no less than zero")
	}
	if s.NeverChoose == nil {
		return errors.New("reprocessing settings: never choose must be a list, empty when nothing is excluded")
	}
	if len(s.NeverChoose) > maxNeverChoose {
		return fmt.Errorf("reprocessing settings: never choose holds %d types, more than the %d allowed", len(s.NeverChoose), maxNeverChoose)
	}
	for _, typeID := range s.NeverChoose {
		if typeID <= 0 {
			return fmt.Errorf("reprocessing settings: never choose holds %d, which is not a type id", typeID)
		}
	}
	return nil
}
