// Package esi reads EVE ESI token-bucket state from Redis (shared with worker ratelimiter).
package esi

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	redislib "github.com/redis/go-redis/v9"
)

const tokenWindow = 15 * time.Minute

// GroupState is Redis-backed ESI limiter state for one group (rolling 15m token window).
type GroupState struct {
	Group                    string  `json:"group"`
	TokenLimit               int     `json:"token_limit"`
	TokenUsed                float64 `json:"token_used"`
	TokenRemaining           float64 `json:"token_remaining"`
	EnforceTokenRestrictions bool    `json:"enforce_token_restrictions"`
	TokenState               string  `json:"token_state,omitempty"`
	WindowDuration           string  `json:"window_duration,omitempty"`
	WindowStartAt            string  `json:"window_start_at,omitempty"`
	NextWindowAt             string  `json:"next_window_at,omitempty"`
	NextWindowIn             string  `json:"next_window_in,omitempty"`
	TokenWaitMs              int64   `json:"token_wait_ms,omitempty"`
	// Metrics-friendly (seconds); 0 when N/A.
	SecondsIntoWindow float64 `json:"seconds_into_window,omitempty"`
	SecondsUntilReset float64 `json:"seconds_until_reset,omitempty"`
}

// DiscoverGroups returns sorted ESI group names seen in Redis (esi:group:* keys).
func DiscoverGroups(ctx context.Context, redisClient *redislib.Client) ([]string, error) {
	patterns := []struct {
		prefix string
		suffix string
	}{
		{prefix: "esi:group:", suffix: ":rate:next_allowed"},
		{prefix: "esi:group:", suffix: ":token_limit"},
		{prefix: "esi:group:", suffix: ":tokens:sum"},
		{prefix: "esi:group:", suffix: ":tokens:seq"},
	}

	names := map[string]struct{}{}
	for _, p := range patterns {
		scanPattern := p.prefix + "*" + p.suffix
		var cursor uint64
		for {
			keys, nextCursor, err := redisClient.Scan(ctx, cursor, scanPattern, 200).Result()
			if err != nil {
				return nil, fmt.Errorf("failed scanning redis with pattern %q: %w", scanPattern, err)
			}
			for _, key := range keys {
				name, ok := extractGroupName(key, p.prefix, p.suffix)
				if ok && name != "" {
					names[name] = struct{}{}
				}
			}
			cursor = nextCursor
			if cursor == 0 {
				break
			}
		}
	}

	out := make([]string, 0, len(names))
	for n := range names {
		out = append(out, n)
	}
	sort.Strings(out)
	return out, nil
}

func extractGroupName(key, prefix, suffix string) (string, bool) {
	if !strings.HasPrefix(key, prefix) || !strings.HasSuffix(key, suffix) {
		return "", false
	}
	middle := strings.TrimPrefix(key, prefix)
	middle = strings.TrimSuffix(middle, suffix)
	return middle, true
}

// ReadGroupState loads token bucket and window timing for one group.
func ReadGroupState(ctx context.Context, redisClient *redislib.Client, now time.Time, group string) (GroupState, error) {
	tokenLimitKey := fmt.Sprintf("esi:group:%s:token_limit", group)
	tokenSumKey := fmt.Sprintf("esi:group:%s:tokens:sum", group)
	tokenZSetKey := fmt.Sprintf("esi:group:%s:tokens:zset", group)

	tokenLimit := -1
	if s, err := redisClient.Get(ctx, tokenLimitKey).Result(); err == nil {
		if parsed, parseErr := strconv.Atoi(strings.TrimSpace(s)); parseErr == nil {
			tokenLimit = parsed
		}
	} else if err != redislib.Nil {
		return GroupState{}, fmt.Errorf("failed reading token limit for group %q: %w", group, err)
	}

	tokenUsed := 0.0
	if val, err := redisClient.Get(ctx, tokenSumKey).Float64(); err == nil {
		tokenUsed = val
	} else if err != redislib.Nil {
		return GroupState{}, fmt.Errorf("failed reading token usage for group %q: %w", group, err)
	}

	state := GroupState{
		Group:                    group,
		TokenLimit:               tokenLimit,
		TokenUsed:                tokenUsed,
		EnforceTokenRestrictions: tokenLimit > 0,
	}
	if tokenLimit > 0 {
		state.WindowDuration = tokenWindow.String()
		state.TokenRemaining = float64(tokenLimit) - tokenUsed
		if state.TokenRemaining > 0 {
			state.TokenState = "ok"
			state.NextWindowIn = "available now"
		} else {
			state.TokenState = "exhausted"
		}
	} else {
		state.TokenRemaining = -1
		state.TokenState = "not_enforced"
		state.NextWindowIn = "not enforced"
	}

	var oldestConsumedAt time.Time
	var haveOldest bool
	if tokenLimit > 0 {
		oldest, err := redisClient.ZRangeWithScores(ctx, tokenZSetKey, 0, 0).Result()
		if err != nil && err != redislib.Nil {
			return GroupState{}, fmt.Errorf("failed reading token bucket timestamps for group %q: %w", group, err)
		}
		if len(oldest) > 0 {
			oldestConsumedAt = esiTokenScoreToTime(oldest[0].Score)
			haveOldest = true
			state.WindowStartAt = oldestConsumedAt.UTC().Format(time.RFC3339)
		}
	}

	if tokenLimit > 0 && state.TokenRemaining <= 0 {
		if haveOldest {
			nextTokenAt := oldestConsumedAt.Add(tokenWindow)
			state.NextWindowAt = nextTokenAt.UTC().Format(time.RFC3339)
			if nextTokenAt.After(now) {
				waitDuration := time.Until(nextTokenAt)
				state.TokenWaitMs = waitDuration.Milliseconds()
				state.NextWindowIn = formatDurationMinutesSeconds(waitDuration)
			} else {
				state.NextWindowIn = "available now"
			}
		} else {
			state.NextWindowIn = "pending recalculation"
		}
	}

	if tokenLimit > 0 && haveOldest {
		sec := now.Sub(oldestConsumedAt).Seconds()
		if sec < 0 {
			sec = 0
		}
		if sec > tokenWindow.Seconds() {
			sec = tokenWindow.Seconds()
		}
		state.SecondsIntoWindow = sec
	}
	if state.TokenWaitMs > 0 {
		state.SecondsUntilReset = float64(state.TokenWaitMs) / 1000.0
	}

	return state, nil
}

// ResetGroupKeys returns Redis keys cleared for one limiter group (token bucket + req pacing).
// token_limit is kept so configured limits from ESI headers remain until refreshed.
func ResetGroupKeys(group string) []string {
	return []string{
		fmt.Sprintf("esi:group:%s:tokens:zset", group),
		fmt.Sprintf("esi:group:%s:tokens:sum", group),
		fmt.Sprintf("esi:group:%s:tokens:seq", group),
		fmt.Sprintf("esi:group:%s:rate:next_allowed", group),
	}
}

func esiTokenScoreToTime(score float64) time.Time {
	sec, frac := math.Modf(score)
	return time.Unix(int64(sec), int64(frac*1e9)).UTC()
}

func formatDurationMinutesSeconds(d time.Duration) string {
	if d < 0 {
		d = 0
	}
	totalSeconds := int(math.Ceil(d.Seconds()))
	minutes := totalSeconds / 60
	seconds := totalSeconds % 60
	if minutes > 0 {
		return fmt.Sprintf("%dm %ds", minutes, seconds)
	}
	return fmt.Sprintf("%ds", seconds)
}
