package changestream

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"eve-industry-planner/core/primaryhandoff"
	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// loadResumeToken returns the stored StartAfter token for groupID, or (nil, false).
// Redis errors are logged and treated as a miss (cold start) — do not block primary.
func loadResumeToken(ctx context.Context, rdb *redis.Client, groupID string) (bson.Raw, bool) {
	if rdb == nil || strings.TrimSpace(groupID) == "" {
		return nil, false
	}
	raw, err := rdb.Get(ctx, primaryhandoff.ResumeTokenKey(groupID)).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, false
	}
	if err != nil {
		logs.WarnCtx(ctx, "changestream resume token load failed; cold start",
			"component", changestreamLogComponent, "group_id", groupID, "error", err)
		return nil, false
	}
	decoded, err := base64.StdEncoding.DecodeString(string(raw))
	if err != nil {
		decoded = raw
	}
	if len(decoded) == 0 {
		return nil, false
	}
	return bson.Raw(decoded), true
}

// saveResumeToken persists token after a successful publish or intentional skip.
// Redis failures are logged only — prefer rare duplicate over failing the event.
func saveResumeToken(ctx context.Context, rdb *redis.Client, groupID string, token bson.Raw) {
	if rdb == nil || len(token) == 0 || strings.TrimSpace(groupID) == "" {
		return
	}
	enc := base64.StdEncoding.EncodeToString(token)
	if err := rdb.Set(ctx, primaryhandoff.ResumeTokenKey(groupID), enc, 0).Err(); err != nil {
		logs.WarnCtx(ctx, "changestream resume token save failed",
			"component", changestreamLogComponent, "group_id", groupID, "error", err)
	}
}

// clearResumeToken deletes a bad/history-lost token for one group.
func clearResumeToken(ctx context.Context, rdb *redis.Client, groupID string) {
	if rdb == nil || strings.TrimSpace(groupID) == "" {
		return
	}
	if err := rdb.Del(ctx, primaryhandoff.ResumeTokenKey(groupID)).Err(); err != nil {
		logs.WarnCtx(ctx, "changestream resume token clear failed",
			"component", changestreamLogComponent, "group_id", groupID, "error", err)
	}
}

// resumeTokenFromEvent extracts the Mongo change-stream resume token (_id).
func resumeTokenFromEvent(changeEvent bson.M) (bson.Raw, error) {
	id, ok := changeEvent["_id"]
	if !ok || id == nil {
		return nil, fmt.Errorf("change event missing _id resume token")
	}
	if raw, ok := id.(bson.Raw); ok {
		return raw, nil
	}
	b, err := bson.Marshal(id)
	if err != nil {
		return nil, fmt.Errorf("marshal resume token: %w", err)
	}
	return bson.Raw(b), nil
}

// isInvalidResumeError reports tokens that cannot be resumed (clear + cold start).
func isInvalidResumeError(err error) bool {
	if err == nil {
		return false
	}
	var cmd mongo.CommandError
	if errors.As(err, &cmd) {
		// 286 ChangeStreamHistoryLost, 280 ChangeStreamFatalError, 260 NonResumableChangeStreamError
		switch cmd.Code {
		case 286, 280, 260:
			return true
		}
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "resume") && (strings.Contains(msg, "history") ||
		strings.Contains(msg, "not found") || strings.Contains(msg, "invalid"))
}
