package documentlock

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/models"
	eipredis "eve-industry-planner/shared/redis"
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

// lockScope is a key's first segment: the planner the document belongs to, and
// what decides whether the lock exists at all between two members.
//
// An account planner renders as the bare account id rather than `account:{id}`,
// which is what these keys have always held. Rendering the owner key would move
// every personal planner's live locks, waitlist entries and viewer rows onto a
// key the readers then miss — and a solo lease lives 24 hours, so an editor's
// protection would lapse silently for that long after a deploy. The kinds that
// never had a key before carry theirs in full.
//
// Safe to tell apart because an account id carries no colon and every other
// owner key does.
func lockScope(owner models.Owner) string {
	if owner.Kind == models.OwnerAccount {
		return owner.ID
	}
	return owner.Key()
}

// parseLockScope reads a scope segment back. One carrying no kind is an account,
// which is every key written before a planner could own one.
func parseLockScope(segment string) (models.Owner, error) {
	if !strings.Contains(segment, ":") {
		return models.AccountOwner(segment), nil
	}
	return models.ParseOwnerKey(segment)
}

// LockKey builds the Redis key for a per-document lock, scoped to the planner so
// keyspace expiry notifications carry it on the key itself.
func LockKey(owner models.Owner, collection, docID string) string {
	return keyPrefix + lockScope(owner) + KeyPartSep + collection + KeyPartSep + docID
}

func waitlistKey(owner models.Owner, collection, docID string) string {
	return waitPrefix + lockScope(owner) + KeyPartSep + collection + KeyPartSep + docID
}

// WaitlistPulseKey is the Redis key proving a session is still waiting on a doc.
func WaitlistPulseKey(owner models.Owner, collection, docID, sessionID string) string {
	return waitlistPulseKeyPrefix(owner, collection, docID) + sessionID
}

// waitlistPulseKeyPrefix is every pulse key for one document, up to and including
// the separator the session id follows.
//
// The scripts build a pulse key in Lua by concatenating this with a session id,
// so the whole key has one builder: two that agreed by hand would let a Go writer
// and a Lua reader address different keys, which reads as a waiter who is never
// alive.
func waitlistPulseKeyPrefix(owner models.Owner, collection, docID string) string {
	return pulsePrefix + lockScope(owner) + KeyPartSep + collection + KeyPartSep + docID + KeyPartSep
}

// TouchWaitlistPulse marks this session as actively waiting (must be refreshed while they remain in queue).
func TouchWaitlistPulse(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID, sessionID string) error {
	if sessionID == "" || rdb.Driver() == nil {
		return nil
	}
	return rdb.PutString(ctx, WaitlistPulseKey(owner, collection, docID, sessionID), "1", WaitlistPulseTTL)
}

func hasWaitlistPulse(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID, sessionID string) (bool, error) {
	if sessionID == "" || rdb.Driver() == nil {
		return false, nil
	}
	return rdb.Exists(ctx, WaitlistPulseKey(owner, collection, docID, sessionID))
}

// PeekWaitlistHeadAlive returns the session at the first queue entry that still
// has a recent pulse; stale heads, and entries naming no account, are removed.
func PeekWaitlistHeadAlive(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID string) (string, error) {
	k := waitlistKey(owner, collection, docID)
	for range 256 {
		head, err := rdb.HeadOfList(ctx, k)
		if err != nil {
			return "", err
		}
		if head == "" {
			return "", nil
		}
		sessionID, _, parsed := parseWaitlistEntry(head)
		if parsed {
			alive, err := hasWaitlistPulse(ctx, rdb, owner, collection, docID, sessionID)
			if err != nil {
				return "", err
			}
			if alive {
				return sessionID, nil
			}
		}
		if _, err := rdb.RemoveFromList(ctx, k, 1, head); err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("peek waitlist alive: loop exceeded")
}

// EnqueueWaitlistUnique enqueues a session on the waitlist (deduped), carrying
// the account it belongs to so a promotion can name the holder.
//
// The bare session id is removed as well as the entry: a session queued before
// the account rode along is the same waiter, and leaving it would queue them
// twice.
func EnqueueWaitlistUnique(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID, sessionID, accountID string) error {
	k := waitlistKey(owner, collection, docID)
	pipe, err := rdb.Pipe()
	if err != nil {
		return err
	}
	entry := waitlistEntry(sessionID, accountID)
	pipe.RemoveFromList(ctx, k, 1, entry)
	pipe.RemoveFromList(ctx, k, 1, sessionID)
	pipe.AppendToList(ctx, k, entry)
	return pipe.Exec(ctx)
}

// PeekWaitlistHead returns the session at the head of the waitlist without pulse
// checks. A head naming no account answers empty, as an empty queue does.
func PeekWaitlistHead(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID string) (string, error) {
	k := waitlistKey(owner, collection, docID)
	head, err := rdb.HeadOfList(ctx, k)
	if err != nil || head == "" {
		return "", err
	}
	sessionID, _, _ := parseWaitlistEntry(head)
	return sessionID, nil
}

// RemoveFromWaitlist removes one occurrence of a session from the waitlist.
//
// Both shapes are removed because a caller names a session rather than an entry,
// and the account it is paired with here is the one that queued it.
func RemoveFromWaitlist(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID, sessionID, accountID string) error {
	k := waitlistKey(owner, collection, docID)
	if _, err := rdb.RemoveFromList(ctx, k, 1, waitlistEntry(sessionID, accountID)); err != nil {
		return err
	}
	_, err := rdb.RemoveFromList(ctx, k, 1, sessionID)
	return err
}

// WaitlistLen returns the length of the waitlist list.
func WaitlistLen(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID string) (int64, error) {
	return rdb.ListLength(ctx, waitlistKey(owner, collection, docID))
}

// ParseExpiredLockKey extracts fields from an expired keyevent payload.
func ParseExpiredLockKey(key string) (owner models.Owner, collection, docID string, ok bool) {
	if !strings.HasPrefix(key, keyPrefix) {
		return models.Owner{}, "", "", false
	}
	rest := key[len(keyPrefix):]
	parts := strings.Split(rest, KeyPartSep)
	if len(parts) != 3 || parts[0] == "" || parts[1] == "" || parts[2] == "" {
		return models.Owner{}, "", "", false
	}
	// The planner rides on the key so a keyspace notification needs no lookup. One
	// naming none is dropped rather than promoted against a guess.
	parsed, err := parseLockScope(parts[0])
	if err != nil {
		return models.Owner{}, "", "", false
	}
	return parsed, parts[1], parts[2], true
}

// GetLock returns the active lock record or nil if none / expired.
func GetLock(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID string) (*LockRecord, error) {
	if rdb.Driver() == nil {
		return nil, eipredis.ErrNoClient
	}
	k := LockKey(owner, collection, docID)
	s, err := rdb.GetString(ctx, k)
	if eipredis.IsNotFound(err) {
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
		_, _ = rdb.Delete(ctx, k)
		return nil, nil
	}
	return &rec, nil
}

// SetLock writes the lock record with DefaultLockTTL.
func SetLock(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID string, rec LockRecord) error {
	b, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	return rdb.PutString(ctx, LockKey(owner, collection, docID), string(b), DefaultLockTTL)
}

func deleteLock(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID string) error {
	_, err := rdb.Delete(ctx, LockKey(owner, collection, docID))
	return err
}

// PromoteWaitlistHead atomically transfers ownership of the lock for
// (owner, collection, docID) to the alive head of the waitlist.
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
	rdb *eipredis.Redis,
	owner models.Owner, collection, docID string,
) (newHolder string, record *LockRecord, promoted bool, err error) {
	if rdb.Driver() == nil {
		return "", nil, false, nil
	}
	now := time.Now().Unix()
	ttlSeconds := int64(DefaultLockTTL / time.Second)

	tx, err := runPromoteWaitlistTx(ctx, rdb, owner, collection, docID, now, ttlSeconds)
	if err != nil {
		return "", nil, false, err
	}
	if tx.Outcome != "promoted" {
		return "", nil, false, nil
	}
	rec := &LockRecord{
		HolderSessionID: tx.NewHolderSessionID,
		AccountID:       tx.NewHolderAccountID,
		ExpiresAtUnix:   tx.ExpiresAtUnix,
	}
	return tx.NewHolderSessionID, rec, true, nil
}

// LockHeldBySession reports whether a non-expired lock is actively held by requesterSessionID.
func LockHeldBySession(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID, requesterSessionID string) (bool, error) {
	if rdb.Driver() == nil || requesterSessionID == "" {
		return false, nil
	}
	rec, err := GetLock(ctx, rdb, owner, collection, docID)
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
func LockHeldByOther(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID, requesterSessionID string) (bool, error) {
	if rdb.Driver() == nil {
		return false, nil
	}
	rec, err := GetLock(ctx, rdb, owner, collection, docID)
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
func DeleteLock(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID string) error {
	if rdb.Driver() == nil {
		return nil
	}
	return deleteLock(ctx, rdb, owner, collection, docID)
}

// DeleteDocLock removes the Redis lock for a document (e.g. after the backing document is deleted).
func DeleteDocLock(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID string) error {
	return DeleteLock(ctx, rdb, owner, collection, docID)
}
