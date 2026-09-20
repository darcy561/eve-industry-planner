package redis

import (
	"context"
	"regexp"
)

// The two shapes market prices were held in before a station became the location
// a price is keyed at: bookkeeping written per type and per region, and a price
// written per type at a region. Nothing reads either, and both were written
// without a lifetime, so they stay until something removes them.
var (
	retiredTypeBookkeeping = regexp.MustCompile(`^esi:market_orders:[0-9]+:[0-9]+:(etags|last_updated)$`)
	retiredRegionPrice     = regexp.MustCompile(`^esi:market_orders:[0-9]+:1[0-9]{7}$`)
)

// RetiredMarketKeys is how many keys of the retired shapes are held, and their
// removal when remove is true.
//
// A key is a candidate only if it has **no lifetime**: every price the running
// code writes carries one, so a key that will expire on its own is this
// release's, whatever its shape looks like. That is what makes the sweep safe to
// run against a live instance and safe to run twice.
func (m *MarketOrdersStore) RetiredMarketKeys(ctx context.Context, remove bool) (int, error) {
	found := 0

	err := m.redis.ScanPrefix(ctx, "esi:market_orders:", func(keys []string) error {
		retired := make([]string, 0, len(keys))
		for _, key := range keys {
			if !retiredTypeBookkeeping.MatchString(key) && !retiredRegionPrice.MatchString(key) {
				continue
			}

			lifetime, err := m.redis.TimeToLive(ctx, key)
			if err != nil {
				return err
			}
			if lifetime != 0 {
				continue
			}
			retired = append(retired, key)
		}

		found += len(retired)
		if !remove || len(retired) == 0 {
			return nil
		}
		return m.redis.Unlink(ctx, retired...)
	})
	if err != nil {
		return 0, err
	}
	return found, nil
}
