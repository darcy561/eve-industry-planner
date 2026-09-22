package models

import (
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// A region id is int64 throughout, as ESI declares it. Rows written before it
// widened hold a BSON int32, and they are the majority of what is stored — so
// the widening is only safe for as long as the narrower form still reads back.
func TestAMarketOrderStoredWithANarrowRegionStillReads(t *testing.T) {
	t.Parallel()

	raw, err := bson.Marshal(bson.M{"region_id": int32(10000002)})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var order MarketOrder
	if err := bson.Unmarshal(raw, &order); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if order.RegionID != 10000002 {
		t.Errorf("region = %d, want 10000002", order.RegionID)
	}
}
