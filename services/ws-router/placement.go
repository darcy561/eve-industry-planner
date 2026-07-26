package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/redis/go-redis/v9"
)

func newRedis(cfg config) *redis.Client {
	return redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", cfg.RedisHost, cfg.RedisPort),
		Password: cfg.RedisPassword,
		DB:       0,
	})
}

func (r *Router) redisOK(ctx context.Context) bool {
	return r.rdb.Ping(ctx).Err() == nil
}

func (r *Router) getPlacement(ctx context.Context, key string) (string, error) {
	return r.rdb.Get(ctx, r.cfg.PlacementKeyPrefix+key).Result()
}

func (r *Router) setPlacement(ctx context.Context, key, slot string) error {
	return r.rdb.Set(ctx, r.cfg.PlacementKeyPrefix+key, slot, r.cfg.PlacementTTL).Err()
}

func (r *Router) touchPlacement(ctx context.Context, key string) {
	_ = r.rdb.Expire(ctx, r.cfg.PlacementKeyPrefix+key, r.cfg.PlacementTTL).Err()
}

func (r *Router) getPin(ctx context.Context, key string) (string, error) {
	return r.rdb.Get(ctx, r.cfg.PinKeyPrefix+key).Result()
}

func (r *Router) isCordoned(ctx context.Context, slot string) bool {
	n, err := r.rdb.Exists(ctx, r.cfg.CordonKeyPrefix+slot).Result()
	return err == nil && n > 0
}

func (r *Router) isFull(ctx context.Context, slot string) bool {
	n, err := r.rdb.Exists(ctx, r.cfg.FullKeyPrefix+slot).Result()
	return err == nil && n > 0
}

// eligibleSlots drops skipped backends (cordoned and/or at client_cutoff). If every
// slot is skipped, returns ready unchanged so /ws is not black-holed — process refuse
// still gates a few overs on a full slot (client_cutoff is an arbitrary operator number).
func eligibleSlots(ready []string, skip map[string]bool) []string {
	if len(ready) == 0 {
		return ready
	}
	out := make([]string, 0, len(ready))
	for _, s := range ready {
		if skip[s] {
			continue
		}
		out = append(out, s)
	}
	if len(out) == 0 {
		return ready
	}
	return out
}

// preferNewestSlots keeps only slots whose bake equals the newest AppVersion
// among ready (semver X.Y.Z). Used so reconnects land on NEW during a dual-warm
// wave instead of staying on OLD (avoids multi-hop as OLD columns drain).
// If versions are missing / incomparable, returns ready unchanged.
func preferNewestSlots(ready []string, versionOf func(slot string) string) []string {
	if len(ready) == 0 {
		return ready
	}
	best := ""
	for _, s := range ready {
		v := strings.TrimSpace(versionOf(s))
		if v == "" {
			continue
		}
		if best == "" || compareSemverXYZ(v, best) > 0 {
			best = v
		}
	}
	if best == "" {
		return ready
	}
	out := make([]string, 0, len(ready))
	for _, s := range ready {
		if strings.TrimSpace(versionOf(s)) == best {
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		return ready
	}
	return out
}

// compareSemverXYZ compares bare X.Y.Z strings. Returns -1/0/1. Non-numeric
// segments compare as 0. Empty a < non-empty b.
func compareSemverXYZ(a, b string) int {
	a, b = strings.TrimSpace(a), strings.TrimSpace(b)
	if a == b {
		return 0
	}
	if a == "" {
		return -1
	}
	if b == "" {
		return 1
	}
	as, bs := strings.Split(a, "."), strings.Split(b, ".")
	n := len(as)
	if len(bs) > n {
		n = len(bs)
	}
	for i := 0; i < n; i++ {
		var ai, bi int
		if i < len(as) {
			fmt.Sscanf(as[i], "%d", &ai)
		}
		if i < len(bs) {
			fmt.Sscanf(bs[i], "%d", &bi)
		}
		if ai < bi {
			return -1
		}
		if ai > bi {
			return 1
		}
	}
	return 0
}

func (r *Router) loadCordoned(ctx context.Context, slots []string) map[string]bool {
	out := map[string]bool{}
	if len(slots) == 0 || r.rdb == nil {
		return out
	}
	for _, s := range slots {
		if r.isCordoned(ctx, s) {
			out[s] = true
		}
	}
	return out
}

func (r *Router) loadFull(ctx context.Context, slots []string) map[string]bool {
	out := map[string]bool{}
	if len(slots) == 0 || r.rdb == nil {
		return out
	}
	for _, s := range slots {
		if r.isFull(ctx, s) {
			out[s] = true
		}
	}
	return out
}

// mergeSkip unions cordon + full skip maps for eligibility.
func mergeSkip(cordoned, full map[string]bool) map[string]bool {
	out := map[string]bool{}
	for k, v := range cordoned {
		if v {
			out[k] = true
		}
	}
	for k, v := range full {
		if v {
			out[k] = true
		}
	}
	return out
}
