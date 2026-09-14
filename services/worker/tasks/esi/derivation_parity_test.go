// How an order book becomes four prices, written down where the SPA can read it.
//
// The server derives prices for the markets it walks; the SPA derives them for
// the markets a reader saves, which it fetches itself. Two implementations of
// one rule, in two languages, and a figure from either sits in the same column —
// so a Jita price and a citadel price must mean the same thing or the column is
// nonsense.
//
// Nothing connects the two copies at runtime. So the cases are derived from the
// real derivation here, committed, and read by the SPA's own parity test. A
// change to either side without the other fails a test rather than quietly
// giving one market a different meaning.
package esi

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// derivationPath is the committed fixture, relative to this package.
const derivationPath = "../../../../testing/fixtures/market-derivation/books.json"

const regenerateDerivation = "EIP_UPDATE_MARKET_DERIVATION=1 go test ./worker/tasks/esi/ -run TestTheDerivationIsCurrent"

const derivationWhy = "Order books in, the four prices out, from " +
	"buildMarketPriceEntry. The SPA derives the same prices for the markets it " +
	"fetches itself, and nothing but this file holds the two in agreement. " +
	"Regenerate with: " + regenerateDerivation

// order is one order as the SPA sees it, in the wire's field names, because the
// SPA reads these straight from ESI.
type order struct {
	Price      float64 `json:"price"`
	IsBuyOrder bool    `json:"is_buy_order"`
	LocationID int64   `json:"location_id"`
	TypeID     int32   `json:"type_id"`
}

// derivedPrices is what one type's orders come to.
type derivedPrices struct {
	Buy     float64 `json:"buy"`
	Sell    float64 `json:"sell"`
	BuyP95  float64 `json:"buyP95"`
	SellP05 float64 `json:"sellP05"`
}

// derivationCase is one book and what it must derive to.
type derivationCase struct {
	Name string `json:"name"`
	Why  string `json:"why"`
	// StationID is the location whose orders count; the rest are another
	// station in the same region and must not reach the figures.
	StationID int64         `json:"stationID"`
	TypeID    int32         `json:"typeID"`
	Orders    []order       `json:"orders"`
	Expected  derivedPrices `json:"expected"`
}

type derivationFixture struct {
	Why   string           `json:"_why"`
	Cases []derivationCase `json:"cases"`
}

// books returns the cases, each chosen for a rule the two sides could disagree
// about rather than to be a realistic market.
func books() []derivationCase {
	return []derivationCase{
		{
			Name:      "a book big enough for percentiles",
			Why:       "Both sides sort and take the nearest rank, so a book over the floor proves the ordinary path.",
			StationID: 60003760,
			TypeID:    34,
			Orders: join(buys(60003760, 34, 10, 11, 12, 13, 14, 15),
				sells(60003760, 34, 20, 21, 22, 23, 24, 25)),
		},
		{
			Name:      "a book under the percentile floor",
			Why:       "Below five orders the percentile degenerates, so both sides must fall back to the best price rather than to a rank.",
			StationID: 60003760,
			TypeID:    34,
			Orders:    join(buys(60003760, 34, 10, 11, 12), sells(60003760, 34, 20, 21, 22)),
		},
		{
			Name:      "exactly at the floor",
			Why:       "Five is the first size that takes a rank rather than the fallback, which is where an off-by-one hides.",
			StationID: 60003760,
			TypeID:    34,
			Orders:    join(buys(60003760, 34, 10, 11, 12, 13, 14), sells(60003760, 34, 20, 21, 22, 23, 24)),
		},
		{
			Name:      "orders at another station in the same region",
			Why:       "The region endpoint answers for every station in it, so a side that forgets the filter prices the wrong market.",
			StationID: 60003760,
			TypeID:    34,
			Orders: join(buys(60003760, 34, 10, 11, 12, 13, 14),
				sells(60003760, 34, 20, 21, 22, 23, 24),
				buys(60008494, 34, 999), sells(60008494, 34, 1)),
		},
		{
			Name:      "only sell orders",
			Why:       "An empty side reports zero rather than failing, and must not drag the side that has orders.",
			StationID: 60003760,
			TypeID:    34,
			Orders:    sells(60003760, 34, 20, 21, 22, 23, 24, 25),
		},
		{
			Name:      "only buy orders",
			Why:       "The mirror of the case above.",
			StationID: 60003760,
			TypeID:    34,
			Orders:    buys(60003760, 34, 10, 11, 12, 13, 14, 15),
		},
		{
			Name:      "prices that are not whole numbers",
			Why:       "A rank picks a stored price rather than computing one, so no rounding may creep in on either side.",
			StationID: 60003760,
			TypeID:    34,
			Orders: join(buys(60003760, 34, 3.89, 3.87, 3.91, 3.8801, 3.9),
				sells(60003760, 34, 4.03, 4.04, 4.02, 4.0399, 4.1)),
		},
		{
			Name: "a book large enough for the rank to leave the extreme",
			Why: "The whole point of carrying both figures. ceil(0.95*n) only steps back " +
				"from the last index at twenty-one orders, and ceil(0.05*n) only steps " +
				"forward from the first at twenty-one, so a smaller book cannot tell a " +
				"real percentile from one that simply returns the best price.",
			StationID: 60003760,
			TypeID:    34,
			Orders: join(
				buys(60003760, 34, ramp(1, 21)...),
				sells(60003760, 34, ramp(100, 21)...),
			),
		},
		{
			Name: "a book where the rank falls on a whole number",
			Why: "Twenty orders makes 0.95*n and 0.05*n whole, which is the only size " +
				"where ceil(p*n)-1 and floor(p*n) disagree. Without this size the fixture " +
				"cannot tell nearest-rank from the off-by-one that looks just like it.",
			StationID: 60003760,
			TypeID:    34,
			Orders: join(
				buys(60003760, 34, ramp(1, 20)...),
				sells(60003760, 34, ramp(100, 20)...),
			),
		},
		{
			Name: "outliers the percentile is there to trim",
			Why: "One absurd order on each side moves the best price and must not move " +
				"the percentile, which is the reason a figure other than the best exists.",
			StationID: 60003760,
			TypeID:    34,
			Orders: join(
				buys(60003760, 34, ramp(1, 24)...), buys(60003760, 34, 9999),
				sells(60003760, 34, ramp(100, 24)...), sells(60003760, 34, 0.01),
			),
		},
	}
}

// orderList is a small builder so a case reads as its prices rather than as
// eight lines of struct per order.
type orderList = []order

// ramp is count prices counting up from first, so a case can state the size of
// book a rule needs without listing twenty numbers.
func ramp(first float64, count int) []float64 {
	out := make([]float64, 0, count)
	for i := range count {
		out = append(out, first+float64(i))
	}
	return out
}

func join(lists ...orderList) orderList {
	out := orderList{}
	for _, list := range lists {
		out = append(out, list...)
	}
	return out
}

func buys(location int64, typeID int32, prices ...float64) orderList {
	return ordersAt(location, typeID, true, prices)
}

func sells(location int64, typeID int32, prices ...float64) orderList {
	return ordersAt(location, typeID, false, prices)
}

func ordersAt(location int64, typeID int32, buy bool, prices []float64) orderList {
	out := make(orderList, 0, len(prices))
	for _, price := range prices {
		out = append(out, order{
			Price:      price,
			IsBuyOrder: buy,
			LocationID: location,
			TypeID:     typeID,
		})
	}
	return out
}

// derive runs a case's orders through the same accumulation and derivation the
// refresh task uses, so the fixture states what the real code does rather than
// what this test thinks it does.
func derive(c derivationCase) derivedPrices {
	acc := &typePriceAccumulator{}
	for _, o := range c.Orders {
		if o.LocationID != c.StationID {
			continue
		}
		if o.IsBuyOrder {
			acc.buyPrices = append(acc.buyPrices, o.Price)
		} else {
			acc.sellPrices = append(acc.sellPrices, o.Price)
		}
	}

	entry := buildMarketPriceEntry(acc, 0)
	return derivedPrices{
		Buy:     entry.Buy,
		Sell:    entry.Sell,
		BuyP95:  entry.BuyP95,
		SellP05: entry.SellP05,
	}
}

func TestTheDerivationIsCurrent(t *testing.T) {
	cases := books()
	for i := range cases {
		cases[i].Expected = derive(cases[i])
	}

	fixture := derivationFixture{Why: derivationWhy, Cases: cases}

	encoded, err := json.MarshalIndent(fixture, "", "  ")
	if err != nil {
		t.Fatalf("encoding derivation fixture: %v", err)
	}
	encoded = append(encoded, '\n')

	if os.Getenv("EIP_UPDATE_MARKET_DERIVATION") == "1" {
		if err := os.MkdirAll(filepath.Dir(derivationPath), 0o755); err != nil {
			t.Fatalf("creating fixture directory: %v", err)
		}
		if err := os.WriteFile(derivationPath, encoded, 0o644); err != nil {
			t.Fatalf("writing derivation fixture: %v", err)
		}
		return
	}

	committed, err := os.ReadFile(derivationPath)
	if err != nil {
		t.Fatalf("reading %s: %v\nRegenerate with: %s", derivationPath, err, regenerateDerivation)
	}

	if string(committed) != string(encoded) {
		t.Errorf("%s is out of date with the derivation.\nRegenerate with: %s",
			derivationPath, regenerateDerivation)
	}
}

// The fixture is only worth committing if it states what the derivation does, so
// these assert the rules the cases were chosen for. They would fail on a fixture
// that was merely self-consistent.
func TestTheDerivationRulesHold(t *testing.T) {
	byName := map[string]derivedPrices{}
	for _, c := range books() {
		byName[c.Name] = derive(c)
	}

	t.Run("a small book falls back to the best price", func(t *testing.T) {
		got := byName["a book under the percentile floor"]
		if got.BuyP95 != got.Buy || got.SellP05 != got.Sell {
			t.Errorf("under the floor the percentiles must equal the best prices, got %+v", got)
		}
	})

	t.Run("another station does not reach the figures", func(t *testing.T) {
		filtered := byName["orders at another station in the same region"]
		clean := byName["exactly at the floor"]
		if filtered != clean {
			t.Errorf("orders at another station changed the figures:\n got %+v\nwant %+v", filtered, clean)
		}
	})

	t.Run("an empty side reports zero", func(t *testing.T) {
		got := byName["only sell orders"]
		if got.Buy != 0 || got.BuyP95 != 0 {
			t.Errorf("a book with no buy orders must report zero for both, got %+v", got)
		}
		if got.Sell == 0 {
			t.Error("the side that has orders must still be priced")
		}
	})

	t.Run("a percentile is a price from the book", func(t *testing.T) {
		got := byName["prices that are not whole numbers"]
		if got.BuyP95 != 3.91 && got.BuyP95 != 3.9 {
			t.Errorf("buyP95 must be one of the stored prices, got %v", got.BuyP95)
		}
	})

	t.Run("a large book moves the percentile off the best price", func(t *testing.T) {
		got := byName["a book large enough for the rank to leave the extreme"]
		if got.BuyP95 == got.Buy {
			t.Errorf("buyP95 must not be the best buy at this size, got %+v", got)
		}
		if got.SellP05 == got.Sell {
			t.Errorf("sellP05 must not be the best sell at this size, got %+v", got)
		}
	})

	// ceil(p*n)-1 and floor(p*n) agree everywhere except where p*n is whole, so
	// this size is what makes the fixture state which rule is in force.
	t.Run("a whole-number rank takes the lower index", func(t *testing.T) {
		got := byName["a book where the rank falls on a whole number"]
		// Prices ramp from 1, so the value is the index plus one.
		if got.BuyP95 != 19 {
			t.Errorf("buyP95 must be the 19th price (ceil(0.95*20)-1 = index 18), got %v", got.BuyP95)
		}
		if got.SellP05 != 100 {
			t.Errorf("sellP05 must be the first price (ceil(0.05*20)-1 = index 0), got %v", got.SellP05)
		}
	})

	t.Run("an outlier moves the best price but not the percentile", func(t *testing.T) {
		trimmed := byName["outliers the percentile is there to trim"]
		if trimmed.Buy != 9999 {
			t.Errorf("the outlier must be the best buy, got %v", trimmed.Buy)
		}
		if trimmed.BuyP95 >= 9999 {
			t.Errorf("the outlier must not reach buyP95, got %v", trimmed.BuyP95)
		}
		if trimmed.Sell != 0.01 {
			t.Errorf("the outlier must be the best sell, got %v", trimmed.Sell)
		}
		if trimmed.SellP05 <= 0.01 {
			t.Errorf("the outlier must not reach sellP05, got %v", trimmed.SellP05)
		}
	})
}
