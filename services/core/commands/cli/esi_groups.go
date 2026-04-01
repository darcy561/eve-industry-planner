package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"eve-industry-planner/shared/shared"

	redislib "github.com/redis/go-redis/v9"
)

type esiGroupState struct {
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
}

// RunEsiRateLimitGroups prints current ESI limiter groups and state from Redis.
func RunEsiRateLimitGroups() error {
	ctx := context.Background()
	clients, err := shared.ConnectServices(ctx, shared.ServiceRedis)
	if err != nil {
		return fmt.Errorf("failed connecting to redis: %w", err)
	}
	defer runImmediateCleanups(clients.CleanupFns...)

	groupNames, err := discoverESIGroups(ctx, clients.Redis)
	if err != nil {
		return err
	}

	now := time.Now()
	states := make([]esiGroupState, 0, len(groupNames))
	for _, group := range groupNames {
		state, err := readESIGroupState(ctx, clients.Redis, now, group)
		if err != nil {
			return err
		}
		states = append(states, state)
	}

	out := map[string]interface{}{
		"retrieved_at": now.UTC().Format(time.RFC3339),
		"group_count":  len(states),
		"groups":       states,
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("failed formatting ESI group state output: %w", err)
	}
	fmt.Println(string(b))
	return nil
}

// resetESIGroupKeys returns Redis keys cleared for one limiter group (token bucket + req pacing).
// token_limit is kept so configured limits from ESI headers remain until refreshed.
func resetESIGroupKeys(group string) []string {
	return []string{
		fmt.Sprintf("esi:group:%s:tokens:zset", group),
		fmt.Sprintf("esi:group:%s:tokens:sum", group),
		fmt.Sprintf("esi:group:%s:tokens:seq", group),
		fmt.Sprintf("esi:group:%s:rate:next_allowed", group),
	}
}

// RunResetEsiRateLimitGroups deletes token-bucket and per-request pacing state for every
// discovered ESI group. Preserves esi:group:{name}:token_limit.
func RunResetEsiRateLimitGroups() error {
	ctx := context.Background()
	clients, err := shared.ConnectServices(ctx, shared.ServiceRedis)
	if err != nil {
		return fmt.Errorf("failed connecting to redis: %w", err)
	}
	defer runImmediateCleanups(clients.CleanupFns...)

	groupNames, err := discoverESIGroups(ctx, clients.Redis)
	if err != nil {
		return err
	}

	type groupReset struct {
		Group       string   `json:"group"`
		KeysDeleted int64    `json:"keys_deleted"`
		Keys        []string `json:"keys"`
	}
	out := make([]groupReset, 0, len(groupNames))
	var total int64
	for _, group := range groupNames {
		keys := resetESIGroupKeys(group)
		n, err := clients.Redis.Del(ctx, keys...).Result()
		if err != nil {
			return fmt.Errorf("failed deleting keys for group %q: %w", group, err)
		}
		total += n
		out = append(out, groupReset{Group: group, KeysDeleted: n, Keys: keys})
	}

	payload := map[string]interface{}{
		"action":       "reset_esi_rate_limiter_groups",
		"finished_at":  time.Now().UTC().Format(time.RFC3339),
		"group_count":  len(groupNames),
		"keys_deleted": total,
		"groups":       out,
	}
	b, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("failed formatting reset output: %w", err)
	}
	fmt.Println(string(b))
	return nil
}

func discoverESIGroups(ctx context.Context, redisClient *redislib.Client) ([]string, error) {
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

func readESIGroupState(ctx context.Context, redisClient *redislib.Client, now time.Time, group string) (esiGroupState, error) {
	tokenLimitKey := fmt.Sprintf("esi:group:%s:token_limit", group)
	tokenSumKey := fmt.Sprintf("esi:group:%s:tokens:sum", group)
	tokenZSetKey := fmt.Sprintf("esi:group:%s:tokens:zset", group)
	const tokenWindow = 15 * time.Minute

	tokenLimit := -1
	if s, err := redisClient.Get(ctx, tokenLimitKey).Result(); err == nil {
		if parsed, parseErr := strconv.Atoi(strings.TrimSpace(s)); parseErr == nil {
			tokenLimit = parsed
		}
	} else if err != redislib.Nil {
		return esiGroupState{}, fmt.Errorf("failed reading token limit for group %q: %w", group, err)
	}

	tokenUsed := 0.0
	if val, err := redisClient.Get(ctx, tokenSumKey).Float64(); err == nil {
		tokenUsed = val
	} else if err != redislib.Nil {
		return esiGroupState{}, fmt.Errorf("failed reading token usage for group %q: %w", group, err)
	}

	state := esiGroupState{
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

	// Rolling window anchor and exhaustion timing come from per-group zset (Redis TIME scores).
	var oldestConsumedAt time.Time
	var haveOldest bool
	if tokenLimit > 0 {
		oldest, err := redisClient.ZRangeWithScores(ctx, tokenZSetKey, 0, 0).Result()
		if err != nil && err != redislib.Nil {
			return esiGroupState{}, fmt.Errorf("failed reading token bucket timestamps for group %q: %w", group, err)
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

	return state, nil
}

// esiTokenScoreToTime converts a Redis zset score from the token bucket (unix seconds, fractional) to UTC wall time.
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

func runImmediateCleanups(cleanups ...func(context.Context)) {
	for _, fn := range cleanups {
		if fn == nil {
			continue
		}
		cctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		func() {
			defer cancel()
			fn(cctx)
		}()
	}
}

