package esiclient_test

import (
	"encoding/json"
	"strings"
	"testing"

	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/httpclient"
)

func TestMarketOrderDecodesTheWireShape(t *testing.T) {
	const payload = `[{
		"duration": 90, "is_buy_order": false, "issued": "2026-08-14T09:12:31Z",
		"location_id": 60003760, "min_volume": 1, "order_id": 7238475123,
		"price": 4999.99, "range": "region", "system_id": 30000142,
		"type_id": 34, "volume_remain": 12000, "volume_total": 50000
	}]`

	var orders []esiclient.MarketOrder
	if err := json.Unmarshal([]byte(payload), &orders); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(orders) != 1 {
		t.Fatalf("decoded %d orders", len(orders))
	}

	order := orders[0]
	switch {
	case order.OrderID != 7238475123:
		t.Errorf("OrderID = %d", order.OrderID)
	case order.Price != 4999.99:
		t.Errorf("Price = %v", order.Price)
	case order.Issued.IsZero():
		t.Error("Issued did not parse as a time")
	case order.IsBuyOrder:
		t.Error("IsBuyOrder should be false")
	case order.VolumeRemain != 12000:
		t.Errorf("VolumeRemain = %d", order.VolumeRemain)
	}
}

func TestIndustrySystemKeepsESIsOwnShape(t *testing.T) {
	const payload = `[{
		"solar_system_id": 30000142,
		"cost_indices": [
			{"activity": "manufacturing", "cost_index": 0.0421},
			{"activity": "invention", "cost_index": 0.0033}
		]
	}]`

	var systems []esiclient.IndustrySystem
	if err := json.Unmarshal([]byte(payload), &systems); err != nil {
		t.Fatalf("decode: %v", err)
	}

	system := systems[0]
	if system.SolarSystemID != 30000142 {
		t.Errorf("SolarSystemID = %d", system.SolarSystemID)
	}
	// ESI sends a list of activities. Flattening it into named fields is the
	// caller's decision, so the wire type must not do it here.
	if len(system.CostIndices) != 2 {
		t.Fatalf("CostIndices = %d, want the list as sent", len(system.CostIndices))
	}
	if system.CostIndices[0].Activity != esiclient.ActivityManufacturing {
		t.Errorf("Activity = %q", system.CostIndices[0].Activity)
	}
	if system.CostIndices[1].CostIndex != 0.0033 {
		t.Errorf("CostIndex = %v", system.CostIndices[1].CostIndex)
	}
}

func TestTypePriceKeepsBothPrices(t *testing.T) {
	const payload = `[{"type_id": 34, "adjusted_price": 5.51, "average_price": 5.42}]`

	var prices []esiclient.TypePrice
	if err := json.Unmarshal([]byte(payload), &prices); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// The application only stores the adjusted price, but the wire type records
	// what ESI sent so a compatibility bump can be reviewed against it.
	if prices[0].AveragePrice != 5.42 {
		t.Errorf("AveragePrice = %v, want the field ESI sends", prices[0].AveragePrice)
	}
}

func TestCharacterAffiliationDecodes(t *testing.T) {
	const payload = `[{"character_id": 91316135, "corporation_id": 98000001, "alliance_id": 99000001}]`

	var affiliations []esiclient.CharacterAffiliation
	if err := json.Unmarshal([]byte(payload), &affiliations); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if affiliations[0].CharacterID != 91316135 || affiliations[0].CorporationID != 98000001 {
		t.Errorf("decoded %+v", affiliations[0])
	}
	if affiliations[0].FactionID != 0 {
		t.Errorf("FactionID = %d, want zero when absent", affiliations[0].FactionID)
	}
}

func TestServerStatusDecodes(t *testing.T) {
	const payload = `{"players": 28451, "server_version": "2748291", "start_time": "2026-09-04T11:02:00Z"}`

	var status esiclient.ServerStatus
	if err := json.Unmarshal([]byte(payload), &status); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if status.Players != 28451 || status.StartTime.IsZero() {
		t.Errorf("decoded %+v", status)
	}
}

func TestWireTypesStreamThroughTheClientDecoder(t *testing.T) {
	var b strings.Builder
	b.WriteByte('[')
	for i := range 500 {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(`{"type_id":34,"adjusted_price":5.51,"average_price":5.42}`)
	}
	b.WriteByte(']')

	seen := 0
	err := httpclient.StreamJSON(strings.NewReader(b.String()), func(p esiclient.TypePrice) error {
		if p.TypeID != 34 {
			t.Errorf("TypeID = %d", p.TypeID)
		}
		seen++
		return nil
	})
	if err != nil {
		t.Fatalf("StreamJSON: %v", err)
	}
	if seen != 500 {
		t.Errorf("streamed %d, want 500", seen)
	}
}
