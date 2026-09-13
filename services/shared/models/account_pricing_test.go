package models

import (
	"reflect"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestDefaultApplicationSettingsPricesBothSides(t *testing.T) {
	settings := DefaultApplicationSettings("acct-1", time.Now().UTC())

	buying := PricingSide{Market: "jita", Basis: "sell"}
	if !reflect.DeepEqual(settings.DefaultPricing.Buying, buying) {
		t.Fatalf("buying = %+v, want %+v", settings.DefaultPricing.Buying, buying)
	}

	// The selling side names a route and no basis: the route decides which side of
	// the book a figure comes from, so a stored basis beside it could disagree
	// with it.
	selling := PricingSide{Market: "jita", Exit: ExitRouteListed}
	if !reflect.DeepEqual(settings.DefaultPricing.Selling, selling) {
		t.Fatalf("selling = %+v, want %+v", settings.DefaultPricing.Selling, selling)
	}
}

// A side is stored as its own subdocument, so the two cannot be read back as one.
func TestPricingDefaultsRoundTripThroughBSON(t *testing.T) {
	in := PricingDefaults{
		Buying:  PricingSide{Market: "jita", Basis: "sell"},
		Selling: PricingSide{Market: "hek", Exit: ExitRouteImmediate},
	}

	raw, err := bson.Marshal(in)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var out PricingDefaults
	if err := bson.Unmarshal(raw, &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !reflect.DeepEqual(out, in) {
		t.Fatalf("round trip = %+v, want %+v", out, in)
	}

	doc := bson.Raw(raw)
	// Each side carries what it answers: both name a market, the buying side names
	// a basis, and the selling side names a route instead of one.
	for key, fields := range map[string][]string{
		"buying":  {"market", "basis"},
		"selling": {"market", "exit"},
	} {
		side, err := doc.LookupErr(key)
		if err != nil {
			t.Fatalf("no %q subdocument: %v", key, err)
		}
		for _, field := range fields {
			if _, err := side.Document().LookupErr(field); err != nil {
				t.Fatalf("%q has no %q field: %v", key, field, err)
			}
		}
	}

	// And the selling side carries no basis at all: omitempty leaves it out, so a
	// reader cannot find a second answer to what the route already decides.
	selling, err := doc.LookupErr("selling")
	if err != nil {
		t.Fatalf("no selling subdocument: %v", err)
	}
	if _, err := selling.Document().LookupErr("basis"); err == nil {
		t.Fatal("selling carries a basis; the route is what answers that")
	}
}

// A group table is stored under the side it belongs to, so a group can never be
// read as an answer for the other one.
func TestPricingGroupsRoundTripUnderTheirSide(t *testing.T) {
	in := PricingDefaults{
		Buying: PricingSide{
			PricingChoice: PricingChoice{Market: "jita", Basis: "sell"},
			Groups:        map[string]PricingChoice{"1857": {Market: "hek"}},
		},
		Selling: PricingSide{PricingChoice: PricingChoice{Market: "amarr", Basis: "buy"}},
	}

	raw, err := bson.Marshal(in)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var out PricingDefaults
	if err := bson.Unmarshal(raw, &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !reflect.DeepEqual(out, in) {
		t.Fatalf("round trip = %+v, want %+v", out, in)
	}

	doc := bson.Raw(raw)
	if _, err := doc.LookupErr("buying", "groups", "1857", "market"); err != nil {
		t.Fatalf("the group is not under its side: %v", err)
	}
	if _, err := doc.LookupErr("selling", "groups"); err == nil {
		t.Fatal("a side with no groups should write none")
	}
	// The embedded pair stays flat rather than nesting under its type name.
	if _, err := doc.LookupErr("buying", "market"); err != nil {
		t.Fatalf("market is not flat on the side: %v", err)
	}
}
