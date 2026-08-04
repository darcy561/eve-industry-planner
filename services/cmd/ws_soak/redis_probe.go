package main

import (
	"context"
	"strings"

	"eve-industry-planner/shared/wsplacement"

	"github.com/redis/go-redis/v9"
)

func scanPrefixKeys(ctx context.Context, rdb *redis.Client, prefix string) ([]string, error) {
	var out []string
	var cursor uint64
	for {
		keys, next, err := rdb.Scan(ctx, cursor, prefix+"*", 100).Result()
		if err != nil {
			return nil, err
		}
		out = append(out, keys...)
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return out, nil
}

func probeSoftFull(ctx context.Context, rdb *redis.Client) (soft, full []string, err error) {
	soft, err = scanPrefixKeys(ctx, rdb, wsplacement.SoftPrefix)
	if err != nil {
		return nil, nil, err
	}
	full, err = scanPrefixKeys(ctx, rdb, wsplacement.FullPrefix)
	if err != nil {
		return nil, nil, err
	}
	return soft, full, nil
}

// probePlacementCounts returns slot -> count for eip:ws:place:v1:* values.
func probePlacementCounts(ctx context.Context, rdb *redis.Client) (map[string]int64, error) {
	keys, err := scanPrefixKeys(ctx, rdb, wsplacement.PlacementPrefix)
	if err != nil {
		return nil, err
	}
	counts := map[string]int64{}
	for _, key := range keys {
		slot, err := rdb.Get(ctx, key).Result()
		if err == redis.Nil {
			continue
		}
		if err != nil {
			return nil, err
		}
		slot = strings.TrimSpace(slot)
		if slot == "" {
			continue
		}
		counts[slot]++
	}
	return counts, nil
}

func lookupPlacement(ctx context.Context, rdb *redis.Client, affinity string) (string, error) {
	affinity = strings.TrimSpace(affinity)
	if affinity == "" || rdb == nil {
		return "", nil
	}
	slot, err := rdb.Get(ctx, wsplacement.PlacementPrefix+affinity).Result()
	if err == redis.Nil {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(slot), nil
}

type redisPlaceLookup struct{ rdb *redis.Client }

func (p redisPlaceLookup) Lookup(ctx context.Context, affinity string) (string, error) {
	return lookupPlacement(ctx, p.rdb, affinity)
}
