package documentlock

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	keyPrefix   = "doc_lock:"
	waitPrefix  = "doc_lock_wait:"
	pulsePrefix = "doc_lock_pulse:"
	// KeyPartSep cannot appear in Mongo collection names / ids used by the app (same as frontend doc lock key).
	KeyPartSep = "\x1e"
)

// DefaultLockTTL is the Redis key TTL and default extension window (contested mode).
const DefaultLockTTL = 5 * time.Minute

// SoloHolderLockTTL is used while the holder has no waitlist entries and no passive viewers.
// Prevents frequent /extend traffic; reverts to DefaultLockTTL when someone joins or requests access.
const SoloHolderLockTTL = 24 * time.Hour

// Lease modes stored on LockRecord.leaseMode.
const (
	LeaseModeSolo      = "solo"
	LeaseModeContested = "contested"
)

// MaxExtensionsBeforeHandoffConsult — after this many consecutive lease segments, extend consults the waitlist.
const MaxExtensionsBeforeHandoffConsult = 3

// ProbeAckWaitSeconds — queued client must POST claim (triggered automatically by WS) within this window or we skip them.
const ProbeAckWaitSeconds int64 = 20

// WaitlistPulseTTL — keys proving this session is still waiting on this doc (refreshed by heartbeat + enqueue + probe).
const WaitlistPulseTTL = 2 * time.Minute

// LockRecord is the JSON shape stored in Redis for a document lock.
type LockRecord struct {
	HolderSessionID      string `json:"holderSessionID"`
	AccountID            string `json:"accountID"`
	ExpiresAtUnix        int64  `json:"expiresAtUnix"`
	LeaseMode            string `json:"leaseMode,omitempty"` // solo | contested
	ExtendCount          int    `json:"extendCount,omitempty"`
	ProbeTargetSessionID string `json:"probeTargetSessionID,omitempty"`
	ProbeExpiresAtUnix   int64  `json:"probeExpiresAtUnix,omitempty"`
}

// SoloLockTTLSeconds returns SoloHolderLockTTL as whole seconds for Lua ARGV.
func SoloLockTTLSeconds() int64 {
	return int64(SoloHolderLockTTL / time.Second)
}

// ContestedLockTTLSeconds returns DefaultLockTTL as whole seconds for Lua ARGV.
func ContestedLockTTLSeconds() int64 {
	return int64(DefaultLockTTL / time.Second)
}

// LockKey builds the Redis key for a per-document lock (account-scoped so
// keyspace expiry notifications carry the account on the key itself).
func LockKey(accountID, collection, docID string) string {
	return keyPrefix + accountID + KeyPartSep + collection + KeyPartSep + docID
}

func waitlistKey(accountID, collection, docID string) string {
	return waitPrefix + accountID + KeyPartSep + collection + KeyPartSep + docID
}

func waitlistPulseKey(accountID, collection, docID, sessionID string) string {
	return pulsePrefix + accountID + KeyPartSep + collection + KeyPartSep + docID + KeyPartSep + sessionID
}

// TouchWaitlistPulse marks this session as actively waiting (must be refreshed while they remain in queue).
func TouchWaitlistPulse(ctx context.Context, rdb *redis.Client, accountID, collection, docID, sessionID string) error {
	if sessionID == "" || rdb == nil {
		return nil
	}
	return rdb.Set(ctx, waitlistPulseKey(accountID, collection, docID, sessionID), "1", WaitlistPulseTTL).Err()
}

func hasWaitlistPulse(ctx context.Context, rdb *redis.Client, accountID, collection, docID, sessionID string) (bool, error) {
	if sessionID == "" || rdb == nil {
		return false, nil
	}
	n, err := rdb.Exists(ctx, waitlistPulseKey(accountID, collection, docID, sessionID)).Result()
	return n > 0, err
}

// PeekWaitlistHeadAlive returns the first queue entry that still has a recent pulse; stale heads are removed.
func PeekWaitlistHeadAlive(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) (string, error) {
	k := waitlistKey(accountID, collection, docID)
	for i := 0; i < 256; i++ {
		head, err := rdb.LIndex(ctx, k, 0).Result()
		if err == redis.Nil || head == "" {
			return "", nil
		}
		if err != nil {
			return "", err
		}
		ok, err := hasWaitlistPulse(ctx, rdb, accountID, collection, docID, head)
		if err != nil {
			return "", err
		}
		if ok {
			return head, nil
		}
		if err := rdb.LRem(ctx, k, 1, head).Err(); err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("peek waitlist alive: loop exceeded")
}

// EnqueueWaitlistUnique enqueues sessionID on the waitlist (deduped).
func EnqueueWaitlistUnique(ctx context.Context, rdb *redis.Client, accountID, collection, docID, sessionID string) error {
	k := waitlistKey(accountID, collection, docID)
	pipe := rdb.Pipeline()
	_ = pipe.LRem(ctx, k, 1, sessionID)
	_ = pipe.RPush(ctx, k, sessionID)
	_, err := pipe.Exec(ctx)
	return err
}

// PeekWaitlistHead returns the raw head of the waitlist without pulse checks.
func PeekWaitlistHead(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) (string, error) {
	k := waitlistKey(accountID, collection, docID)
	s, err := rdb.LIndex(ctx, k, 0).Result()
	if err == redis.Nil {
		return "", nil
	}
	return s, err
}

// RemoveFromWaitlist removes one occurrence of sessionID from the waitlist.
func RemoveFromWaitlist(ctx context.Context, rdb *redis.Client, accountID, collection, docID, sessionID string) error {
	return rdb.LRem(ctx, waitlistKey(accountID, collection, docID), 1, sessionID).Err()
}

// WaitlistLen returns the length of the waitlist list.
func WaitlistLen(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) (int64, error) {
	return rdb.LLen(ctx, waitlistKey(accountID, collection, docID)).Result()
}

// ParseExpiredLockKey extracts fields from an expired keyevent payload.
func ParseExpiredLockKey(key string) (accountID, collection, docID string, ok bool) {
	if !strings.HasPrefix(key, keyPrefix) {
		return "", "", "", false
	}
	rest := key[len(keyPrefix):]
	parts := strings.Split(rest, KeyPartSep)
	if len(parts) != 3 || parts[0] == "" || parts[1] == "" || parts[2] == "" {
		return "", "", "", false
	}
	return parts[0], parts[1], parts[2], true
}

// GetLock returns the active lock record or nil if none / expired.
func GetLock(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) (*LockRecord, error) {
	if rdb == nil {
		return nil, fmt.Errorf("redis unavailable")
	}
	k := LockKey(accountID, collection, docID)
	s, err := rdb.Get(ctx, k).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var rec LockRecord
	if err := json.Unmarshal([]byte(s), &rec); err != nil {
		return nil, err
	}
	now := time.Now().Unix()
	if rec.ExpiresAtUnix > 0 && now > rec.ExpiresAtUnix {
		_ = rdb.Del(ctx, k).Err()
		return nil, nil
	}
	return &rec, nil
}

// SetLock writes the lock record with DefaultLockTTL.
func SetLock(ctx context.Context, rdb *redis.Client, accountID, collection, docID string, rec LockRecord) error {
	b, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	return rdb.Set(ctx, LockKey(accountID, collection, docID), b, DefaultLockTTL).Err()
}

func deleteLock(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) error {
	return rdb.Del(ctx, LockKey(accountID, collection, docID)).Err()
}

// PromoteWaitlistHead atomically transfers ownership of the lock for
// (accountID, collection, docID) to the alive head of the waitlist.
//
// Used by the TTL expiry subscriber (HandOver has its own atomic script that
// also enforces the prior-holder check). Returns:
//   - (head, &rec, true, nil)  — a live waitlist head was found, the lock now
//     points at them, the waitlist has been dequeued, and the caller should
//     publish the appropriate `document_lock_handoff_completed` event.
//   - ("",   nil,  false, nil) — no live waitlist head; caller decides whether
//     to /release outright (handover) or publish `document_lock_expired`
//     (expiry subscriber).
//   - ("",   nil,  false, err) — fatal Redis error, caller should bail.
//
// The new record clears extend/probe state so it reads back as a clean lease.
// The peek-alive walk, lock rewrite and waitlist dequeue happen inside one
// Redis EVAL so a second concurrent promotion cannot double-grant.
func PromoteWaitlistHead(
	ctx context.Context,
	rdb *redis.Client,
	accountID, collection, docID string,
) (newHolder string, record *LockRecord, promoted bool, err error) {
	if rdb == nil {
		return "", nil, false, nil
	}
	now := time.Now().Unix()
	ttlSeconds := int64(DefaultLockTTL / time.Second)

	tx, err := runPromoteWaitlistTx(ctx, rdb, accountID, collection, docID, now, ttlSeconds)
	if err != nil {
		return "", nil, false, err
	}
	if tx.Outcome != "promoted" {
		return "", nil, false, nil
	}
	rec := &LockRecord{
		HolderSessionID: tx.NewHolderSessionID,
		AccountID:       accountID,
		ExpiresAtUnix:   tx.ExpiresAtUnix,
	}
	return tx.NewHolderSessionID, rec, true, nil
}

// LockHeldBySession reports whether a non-expired lock is actively held by requesterSessionID.
func LockHeldBySession(ctx context.Context, rdb *redis.Client, accountID, collection, docID, requesterSessionID string) (bool, error) {
	if rdb == nil || requesterSessionID == "" {
		return false, nil
	}
	rec, err := GetLock(ctx, rdb, accountID, collection, docID)
	if err != nil {
		return false, err
	}
	if rec == nil || rec.HolderSessionID == "" {
		return false, nil
	}
	return rec.HolderSessionID == requesterSessionID, nil
}

// LockHeldByOther reports whether a non-expired lock is held by a session other than requesterSessionID.
// If requesterSessionID is empty, any active lock counts as blocking.
func LockHeldByOther(ctx context.Context, rdb *redis.Client, accountID, collection, docID, requesterSessionID string) (bool, error) {
	if rdb == nil {
		return false, nil
	}
	rec, err := GetLock(ctx, rdb, accountID, collection, docID)
	if err != nil {
		return false, err
	}
	if rec == nil || rec.HolderSessionID == "" {
		return false, nil
	}
	if requesterSessionID == "" {
		return true, nil
	}
	return rec.HolderSessionID != requesterSessionID, nil
}

// DeleteLock removes the lock key.
func DeleteLock(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) error {
	if rdb == nil {
		return nil
	}
	return deleteLock(ctx, rdb, accountID, collection, docID)
}

// DeleteDocLock removes the Redis lock for a document (e.g. after the backing document is deleted).
func DeleteDocLock(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) error {
	return DeleteLock(ctx, rdb, accountID, collection, docID)
}
