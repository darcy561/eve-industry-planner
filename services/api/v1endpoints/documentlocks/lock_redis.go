package documentlocks

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	keyPrefixV1  = "doc_lock:v1:"
	keyPrefixV2  = "doc_lock:v2:"
	waitPrefix   = "doc_lock_wait:v2:"
	pulsePrefix  = "doc_lock_pulse:v2:"
	// keyPartSep cannot appear in Mongo collection names / ids used by the app (same as frontend doc lock key).
	keyPartSep = "\x1e"
)

// DefaultLockTTL is the Redis key TTL and default extension window.
const DefaultLockTTL = 5 * time.Minute

// MaxExtensionsBeforeHandoffConsult — after this many consecutive lease segments, extend consults the waitlist.
const MaxExtensionsBeforeHandoffConsult = 3

// ProbeAckWaitSeconds — queued client must POST claim (triggered automatically by WS) within this window or we skip them.
const ProbeAckWaitSeconds int64 = 20

// WaitlistPulseTTL — keys proving this session is still waiting on this doc (refreshed by heartbeat + enqueue + probe).
const WaitlistPulseTTL = 2 * time.Minute

type lockRecord struct {
	HolderSessionID      string `json:"holderSessionID"`
	AccountID            string `json:"accountID"`
	ExpiresAtUnix        int64  `json:"expiresAtUnix"`
	ExtendCount          int    `json:"extendCount,omitempty"`
	ProbeTargetSessionID string `json:"probeTargetSessionID,omitempty"`
	ProbeExpiresAtUnix   int64  `json:"probeExpiresAtUnix,omitempty"`
}

func lockKeyV1(collection, docID string) string {
	return keyPrefixV1 + collection + ":" + docID
}

// LockKeyV2 builds the Redis key including account id (used for keyspace expiry notifications).
func LockKeyV2(accountID, collection, docID string) string {
	return keyPrefixV2 + accountID + keyPartSep + collection + keyPartSep + docID
}

func waitlistKey(accountID, collection, docID string) string {
	return waitPrefix + accountID + keyPartSep + collection + keyPartSep + docID
}

func waitlistPulseKey(accountID, collection, docID, sessionID string) string {
	return pulsePrefix + accountID + keyPartSep + collection + keyPartSep + docID + keyPartSep + sessionID
}

// touchWaitlistPulse marks this session as actively waiting (must be refreshed while they remain in queue).
func touchWaitlistPulse(ctx context.Context, rdb *redis.Client, accountID, collection, docID, sessionID string) error {
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

// peekWaitlistHeadAlive returns the first queue entry that still has a recent pulse; stale heads are removed.
func peekWaitlistHeadAlive(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) (string, error) {
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

func enqueueWaitlistUnique(ctx context.Context, rdb *redis.Client, accountID, collection, docID, sessionID string) error {
	k := waitlistKey(accountID, collection, docID)
	pipe := rdb.Pipeline()
	_ = pipe.LRem(ctx, k, 1, sessionID)
	_ = pipe.RPush(ctx, k, sessionID)
	_, err := pipe.Exec(ctx)
	return err
}

func peekWaitlistHead(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) (string, error) {
	k := waitlistKey(accountID, collection, docID)
	s, err := rdb.LIndex(ctx, k, 0).Result()
	if err == redis.Nil {
		return "", nil
	}
	return s, err
}

func removeFromWaitlist(ctx context.Context, rdb *redis.Client, accountID, collection, docID, sessionID string) error {
	return rdb.LRem(ctx, waitlistKey(accountID, collection, docID), 1, sessionID).Err()
}

func waitlistLen(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) (int64, error) {
	return rdb.LLen(ctx, waitlistKey(accountID, collection, docID)).Result()
}

// ParseExpiredLockKey extracts fields from an expired keyevent payload (doc_lock:v2 only).
func ParseExpiredLockKey(key string) (accountID, collection, docID string, ok bool) {
	if !strings.HasPrefix(key, keyPrefixV2) {
		return "", "", "", false
	}
	rest := key[len(keyPrefixV2):]
	parts := strings.Split(rest, keyPartSep)
	if len(parts) != 3 || parts[0] == "" || parts[1] == "" || parts[2] == "" {
		return "", "", "", false
	}
	return parts[0], parts[1], parts[2], true
}

func getLock(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) (*lockRecord, error) {
	if rdb == nil {
		return nil, fmt.Errorf("redis unavailable")
	}
	k2 := LockKeyV2(accountID, collection, docID)
	s, err := rdb.Get(ctx, k2).Result()
	if err != nil && err != redis.Nil {
		return nil, err
	}
	if err == redis.Nil {
		s, err = rdb.Get(ctx, lockKeyV1(collection, docID)).Result()
		if err == redis.Nil {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
	}
	var rec lockRecord
	if err := json.Unmarshal([]byte(s), &rec); err != nil {
		return nil, err
	}
	now := time.Now().Unix()
	if rec.ExpiresAtUnix > 0 && now > rec.ExpiresAtUnix {
		_ = rdb.Del(ctx, k2, lockKeyV1(collection, docID)).Err()
		return nil, nil
	}
	return &rec, nil
}

func setLock(ctx context.Context, rdb *redis.Client, accountID, collection, docID string, rec lockRecord) error {
	b, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	k2 := LockKeyV2(accountID, collection, docID)
	k1 := lockKeyV1(collection, docID)
	pipe := rdb.Pipeline()
	_ = pipe.Set(ctx, k2, b, DefaultLockTTL)
	_ = pipe.Del(ctx, k1)
	_, err = pipe.Exec(ctx)
	return err
}

func deleteLock(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) error {
	k2 := LockKeyV2(accountID, collection, docID)
	k1 := lockKeyV1(collection, docID)
	return rdb.Del(ctx, k2, k1).Err()
}

// DeleteDocLock removes the Redis lock for a document (e.g. after the backing document is deleted).
func DeleteDocLock(ctx context.Context, rdb *redis.Client, accountID, collection, docID string) error {
	if rdb == nil {
		return nil
	}
	return deleteLock(ctx, rdb, accountID, collection, docID)
}

// promoteWaitlistHead atomically transfers ownership of the lock for
// (accountID, collection, docID) to the alive head of the waitlist.
//
// Used by /hand-over (interactive holder accept) and the TTL expiry
// subscriber. Returns:
//   - (head, &rec, true, nil)  — a live waitlist head was found, the lock now
//     points at them, the waitlist has been dequeued, and the caller should
//     publish the appropriate `document_lock_handoff_completed` event.
//   - ("",   nil,  false, nil) — no live waitlist head; caller decides whether
//     to /release outright (handover) or publish `document_lock_expired`
//     (expiry subscriber).
//   - ("",   nil,  false, err) — fatal Redis error, caller should bail.
//
// The new record clears extend/probe state so it reads back as a clean lease.
// Dequeue failures are non-fatal (the head will be filtered next time
// `peekWaitlistHeadAlive` runs against them).
func promoteWaitlistHead(
	ctx context.Context,
	rdb *redis.Client,
	accountID, collection, docID string,
) (newHolder string, record *lockRecord, promoted bool, err error) {
	if rdb == nil {
		return "", nil, false, nil
	}
	head, err := peekWaitlistHeadAlive(ctx, rdb, accountID, collection, docID)
	if err != nil {
		return "", nil, false, err
	}
	if head == "" {
		return "", nil, false, nil
	}
	exp := time.Now().Unix() + int64(DefaultLockTTL/time.Second)
	rec := lockRecord{
		HolderSessionID: head,
		AccountID:       accountID,
		ExpiresAtUnix:   exp,
	}
	if err := setLock(ctx, rdb, accountID, collection, docID, rec); err != nil {
		return "", nil, false, err
	}
	if err := removeFromWaitlist(ctx, rdb, accountID, collection, docID, head); err != nil {
		// Lock is already promoted; failing to dequeue is non-fatal because
		// `peekWaitlistHeadAlive`'s pulse check will filter the stale entry the
		// next time a caller asks.
		_ = err
	}
	return head, &rec, true, nil
}

// LockHeldByOther reports whether a non-expired lock is held by a session other than requesterSessionID.
// If requesterSessionID is empty, any active lock counts as blocking.
func LockHeldByOther(ctx context.Context, rdb *redis.Client, accountID, collection, docID, requesterSessionID string) (bool, error) {
	if rdb == nil {
		return false, nil
	}
	rec, err := getLock(ctx, rdb, accountID, collection, docID)
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
