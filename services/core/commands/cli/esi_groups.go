package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"eve-industry-planner/core/esilimits"
	"eve-industry-planner/shared/shared"
)

// RunEsiRateLimitGroups prints current ESI limiter groups and state from Redis.
func RunEsiRateLimitGroups() error {
	ctx := context.Background()
	clients, err := shared.ConnectServices(ctx, shared.ServiceRedis)
	if err != nil {
		return fmt.Errorf("failed connecting to redis: %w", err)
	}
	defer runImmediateCleanups(clients.CleanupFns...)

	groupNames, err := esilimits.DiscoverGroups(ctx, clients.Redis)
	if err != nil {
		return err
	}

	now := time.Now()
	states := make([]esilimits.GroupState, 0, len(groupNames))
	for _, group := range groupNames {
		state, err := esilimits.ReadGroupState(ctx, clients.Redis, now, group)
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

// RunResetEsiRateLimitGroups deletes token-bucket and per-request pacing state for every
// discovered ESI group. Preserves esi:group:{name}:token_limit.
func RunResetEsiRateLimitGroups() error {
	ctx := context.Background()
	clients, err := shared.ConnectServices(ctx, shared.ServiceRedis)
	if err != nil {
		return fmt.Errorf("failed connecting to redis: %w", err)
	}
	defer runImmediateCleanups(clients.CleanupFns...)

	groupNames, err := esilimits.DiscoverGroups(ctx, clients.Redis)
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
		keys := esilimits.ResetGroupKeys(group)
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
