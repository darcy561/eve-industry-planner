// Package documentlock — atomic.go contains the Lua-script transitions that
// replace the previous read-modify-write pattern in service_ops.go.
//
// # Why Lua?
//
// Every state-changing op used to read the LockRecord with `GetLock`, mutate
// it in Go, then write it back with `SetLock`. Under contention this is
// TOCTOU-racy: two callers can both see `existing == nil` (Acquire), or two
// holders can both pass the "are we the holder?" check before either reaches
// the write (HandOver/Release/Extend). The reader can win the race against
// the writer and observe a transient "no holder" state during a handoff that
// was actually atomic from the operator's intent.
//
// Each transition below is a single `EVAL` (or `EVALSHA`) so Redis serialises
// the entire read+mutate+write inside the script. The Go side only:
//   - prepares the arguments,
//   - decodes the JSON-shaped outcome,
//   - publishes JetStream events when the script reports a successful transition.
//
// # Result encoding
//
// Each script ends with `cjson.encode(table)` and returns the JSON string.
// Go decodes it into a typed struct per script. Using JSON (vs a positional
// Redis array) makes new outcome fields a backwards-compatible addition.
//
// # Key layout
//
// Lock and waitlist keys are passed in `KEYS` where the script knows them up
// front. For ops that walk the waitlist to find an alive head, the pulse key
// is constructed inside Lua from a `pulse_prefix` ARGV (everything before
// `{sessionID}`). On a single-Redis deployment EVAL still serialises this;
// on Redis Cluster, all lock/waitlist/pulse keys would need a shared hash
// tag — out of scope for this change, but tracked in the doc-lock
// improvement notes.
package documentlock

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// docLockTxResultLockRecord matches the LockRecord JSON shape inside a script
// outcome. We use a dedicated type so we don't conflate "lock record stored
// in Redis" (parsed from string GET) with "lock record reported by a script
// transition" (returned in the outcome JSON).
//
// Field nullability:
//   - HolderSessionID: empty means "no holder" (record absent or just released).
//   - ExpiresAtUnix:   zero is meaningful only when HolderSessionID is empty.
type docLockTxResultLockRecord struct {
	HolderSessionID      string `json:"holderSessionID,omitempty"`
	AccountID            string `json:"accountID,omitempty"`
	ExpiresAtUnix        int64  `json:"expiresAtUnix,omitempty"`
	LeaseMode            string `json:"leaseMode,omitempty"`
	ExtendCount          int    `json:"extendCount,omitempty"`
	ProbeTargetSessionID string `json:"probeTargetSessionID,omitempty"`
	ProbeExpiresAtUnix   int64  `json:"probeExpiresAtUnix,omitempty"`
}

// --- Shared Lua snippet pieces ---------------------------------------------
//
// findAliveHeadLuaFn is inserted at the top of every script that walks the
// waitlist for an alive head. It iterates the list head, removes stale
// entries (no pulse key), and returns the first alive sessionID or nil.
//
// `pulse_prefix` includes the trailing separator so we can concatenate
// directly with the candidate sessionID.
const findAliveHeadLuaFn = `
local function find_alive_head(k_wait, pulse_prefix)
  for i = 1, 256 do
    local head = redis.call("LINDEX", k_wait, 0)
    if not head or head == false or head == "" then
      return nil
    end
    local exists = redis.call("EXISTS", pulse_prefix .. head)
    if exists == 1 then
      return head
    end
    redis.call("LREM", k_wait, 1, head)
  end
  return nil
end
`

// writeLockLuaFn writes a LockRecord (constructed in Lua) at KEYS[1] with
// the DefaultLockTTL (mirror of Go's `SetLock`).
const writeLockLuaFn = `
local function write_lock(k_lock, record_tbl, ttl_seconds)
  redis.call("SET", k_lock, cjson.encode(record_tbl), "EX", ttl_seconds)
end
`

// readLockLuaFn loads the lock record from KEYS[1] and returns the decoded
// table or nil. It defensively wipes an already-expired record, mirroring
// `GetLock` in Go.
const readLockLuaFn = `
local function read_lock(k_lock, now)
  local raw = redis.call("GET", k_lock)
  if not raw or raw == false then
    return nil
  end
  local ok, rec = pcall(cjson.decode, raw)
  if not ok or type(rec) ~= "table" then
    return nil
  end
  if rec.expiresAtUnix and tonumber(rec.expiresAtUnix) and tonumber(rec.expiresAtUnix) < now then
    redis.call("DEL", k_lock)
    return nil
  end
  return rec
end
`

// --- Per-op scripts --------------------------------------------------------

// acquireLockScript implements `Service.Acquire` as one EVAL.
//
//	KEYS[1]  = lock key
//	ARGV[1]  = accountID
//	ARGV[2]  = sessionID (requester)
//	ARGV[3]  = now (unix seconds)
//	ARGV[4]  = contested ttl seconds (DefaultLockTTL)
//	ARGV[5]  = solo ttl seconds (SoloHolderLockTTL)
//
// Outcome JSON:
//
//	{ "outcome": "granted"|"contended", "record": {...}, "previousHolderSessionID": "" }
var acquireLockScript = redis.NewScript(readLockLuaFn + writeLockLuaFn + `
local k_lock = KEYS[1]
local account_id = ARGV[1]
local session_id = ARGV[2]
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local solo_ttl = tonumber(ARGV[5])

local existing = read_lock(k_lock, now)
if existing and existing.holderSessionID and existing.holderSessionID ~= "" and existing.holderSessionID ~= session_id then
  return cjson.encode({
    outcome = "contended",
    record = existing,
  })
end

local exp = now + solo_ttl
local rec = {
  holderSessionID = session_id,
  accountID = account_id,
  expiresAtUnix = exp,
  leaseMode = "solo",
  extendCount = 0,
}
write_lock(k_lock, rec, solo_ttl)
return cjson.encode({
  outcome = "granted",
  record = rec,
})
`)

// acquireTxResult is the decoded acquireLockScript outcome.
type acquireTxResult struct {
	Outcome string                    `json:"outcome"`
	Record  docLockTxResultLockRecord `json:"record"`
}

func runAcquireTx(ctx context.Context, rdb *redis.Client, accountID, sessionID, collection, docID string, now, contestedTTLSeconds, soloTTLSeconds int64) (*acquireTxResult, error) {
	raw, err := acquireLockScript.Run(
		ctx,
		rdb,
		[]string{LockKey(accountID, collection, docID)},
		accountID,
		sessionID,
		now,
		contestedTTLSeconds,
		soloTTLSeconds,
	).Text()
	if err != nil {
		return nil, fmt.Errorf("acquire tx: %w", err)
	}
	var out acquireTxResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, fmt.Errorf("acquire tx: decode: %w", err)
	}
	return &out, nil
}

// extendLockScript implements `Service.Extend` as one EVAL.
//
//	KEYS[1]  = lock key
//	KEYS[2]  = waitlist key
//	ARGV[1]  = pulse-key prefix (includes trailing separator)
//	ARGV[2]  = sessionID (requester)
//	ARGV[3]  = now (unix seconds)
//	ARGV[4]  = ttl seconds
//	ARGV[5]  = max extends before consulting waitlist
//	ARGV[6]  = probe-ack wait seconds
//	ARGV[7]  = waitlist-pulse TTL seconds
//	ARGV[8]  = solo ttl seconds (cycle_reset when waitlist empty)
//
// Outcome JSON:
//
//	{
//	  "outcome": "not_holder_absent" | "not_holder_other" | "extended" | "probe_pending" | "cycle_reset" | "probe_set",
//	  "record": {...},
//	  "expiresAtUnix": 0,
//	  "extendCount": 0,
//	  "probeTargetSessionID": "",
//	  "probeExpiresAtUnix": 0,
//	  "publishProbe": false
//	}
var extendLockScript = redis.NewScript(readLockLuaFn + writeLockLuaFn + findAliveHeadLuaFn + `
local k_lock = KEYS[1]
local k_wait = KEYS[2]
local pulse_prefix = ARGV[1]
local session_id = ARGV[2]
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local max_extends = tonumber(ARGV[5])
local probe_ack = tonumber(ARGV[6])
local pulse_ttl = tonumber(ARGV[7])
local solo_ttl = tonumber(ARGV[8])

local existing = read_lock(k_lock, now)
if not existing then
  return cjson.encode({ outcome = "not_holder_absent" })
end
if existing.holderSessionID ~= session_id then
  return cjson.encode({
    outcome = "not_holder_other",
    record = existing,
  })
end

local exp = now + ttl

-- Probe expired -> drop the stale probe target from the waitlist before
-- continuing the normal extend path. Clears probe fields so we re-evaluate.
if existing.probeTargetSessionID and existing.probeTargetSessionID ~= "" then
  if not existing.probeExpiresAtUnix or now >= tonumber(existing.probeExpiresAtUnix) then
    redis.call("LREM", k_wait, 1, existing.probeTargetSessionID)
    existing.probeTargetSessionID = ""
    existing.probeExpiresAtUnix = 0
  end
end

-- Probe still active -> extend the lease but keep probe metadata.
if existing.probeTargetSessionID and existing.probeTargetSessionID ~= "" and now < tonumber(existing.probeExpiresAtUnix) then
  existing.expiresAtUnix = exp
  write_lock(k_lock, existing, ttl)
  return cjson.encode({
    outcome = "probe_pending",
    record = existing,
    expiresAtUnix = exp,
    extendCount = existing.extendCount or 0,
    probeTargetSessionID = existing.probeTargetSessionID,
    probeExpiresAtUnix = existing.probeExpiresAtUnix,
  })
end

local current_count = tonumber(existing.extendCount) or 0
if current_count < max_extends then
  existing.extendCount = current_count + 1
  existing.expiresAtUnix = exp
  existing.leaseMode = "contested"
  write_lock(k_lock, existing, ttl)
  return cjson.encode({
    outcome = "extended",
    record = existing,
    expiresAtUnix = exp,
    extendCount = existing.extendCount,
  })
end

existing.expiresAtUnix = exp
local head = find_alive_head(k_wait, pulse_prefix)
if not head then
  existing.extendCount = 0
  existing.leaseMode = "solo"
  existing.probeTargetSessionID = ""
  existing.probeExpiresAtUnix = 0
  local solo_exp = now + solo_ttl
  existing.expiresAtUnix = solo_exp
  write_lock(k_lock, existing, solo_ttl)
  return cjson.encode({
    outcome = "cycle_reset",
    record = existing,
    expiresAtUnix = solo_exp,
    extendCount = 0,
  })
end

-- Refresh the probe target's pulse so they don't fall out before they /claim.
redis.call("SET", pulse_prefix .. head, "1", "EX", pulse_ttl)

existing.leaseMode = "contested"
existing.probeTargetSessionID = head
existing.probeExpiresAtUnix = now + probe_ack
write_lock(k_lock, existing, ttl)
return cjson.encode({
  outcome = "probe_set",
  record = existing,
  expiresAtUnix = exp,
  extendCount = existing.extendCount or 0,
  probeTargetSessionID = head,
  probeExpiresAtUnix = existing.probeExpiresAtUnix,
  publishProbe = true,
})
`)

type extendTxResult struct {
	Outcome              string                    `json:"outcome"`
	Record               docLockTxResultLockRecord `json:"record"`
	ExpiresAtUnix        int64                     `json:"expiresAtUnix,omitempty"`
	ExtendCount          int                       `json:"extendCount,omitempty"`
	ProbeTargetSessionID string                    `json:"probeTargetSessionID,omitempty"`
	ProbeExpiresAtUnix   int64                     `json:"probeExpiresAtUnix,omitempty"`
	PublishProbe         bool                      `json:"publishProbe,omitempty"`
}

func runExtendTx(
	ctx context.Context,
	rdb *redis.Client,
	accountID, sessionID, collection, docID string,
	now, ttlSeconds, maxExtends, probeAck, pulseTTL, soloTTLSeconds int64,
) (*extendTxResult, error) {
	raw, err := extendLockScript.Run(
		ctx,
		rdb,
		[]string{
			LockKey(accountID, collection, docID),
			waitlistKey(accountID, collection, docID),
		},
		waitlistPulseKeyPrefix(accountID, collection, docID),
		sessionID,
		now,
		ttlSeconds,
		maxExtends,
		probeAck,
		pulseTTL,
		soloTTLSeconds,
	).Text()
	if err != nil {
		return nil, fmt.Errorf("extend tx: %w", err)
	}
	var out extendTxResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, fmt.Errorf("extend tx: decode: %w", err)
	}
	return &out, nil
}

// releaseLockScript implements `Service.Release` as one EVAL.
//
//	KEYS[1]  = lock key
//	ARGV[1]  = sessionID (caller)
//	ARGV[2]  = now (unix seconds)
//
// Outcome JSON:
//
//	{ "outcome": "released" | "noop" }
//
// "released" means the caller really was the holder and we DELed the key.
// "noop" covers (no record, expired, not the holder).
var releaseLockScript = redis.NewScript(readLockLuaFn + `
local k_lock = KEYS[1]
local session_id = ARGV[1]
local now = tonumber(ARGV[2])

local existing = read_lock(k_lock, now)
if not existing or existing.holderSessionID ~= session_id then
  return cjson.encode({ outcome = "noop" })
end

redis.call("DEL", k_lock)
return cjson.encode({ outcome = "released" })
`)

type releaseTxResult struct {
	Outcome string `json:"outcome"`
}

func runReleaseTx(ctx context.Context, rdb *redis.Client, accountID, sessionID, collection, docID string, now int64) (*releaseTxResult, error) {
	raw, err := releaseLockScript.Run(
		ctx,
		rdb,
		[]string{LockKey(accountID, collection, docID)},
		sessionID,
		now,
	).Text()
	if err != nil {
		return nil, fmt.Errorf("release tx: %w", err)
	}
	var out releaseTxResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, fmt.Errorf("release tx: decode: %w", err)
	}
	return &out, nil
}

// forceReleaseSameAccountScript clears a lock held by another session on the
// same account (JWT accountID). Caller must not be the current holder — use
// POST /release instead.
//
//	KEYS[1]  = lock key
//	KEYS[2]  = waitlist key
//	ARGV[1]  = caller sessionID (requester)
//	ARGV[2]  = now (unix seconds)
//	ARGV[3]  = accountID (must match record.accountID)
//
// Outcome JSON:
//
//	{
//	  "outcome": "released" | "noop_no_lock" | "noop_same_holder",
//	  "previousHolderSessionID": ""   // set only when outcome == released
//	}
var forceReleaseSameAccountScript = redis.NewScript(readLockLuaFn + `
local k_lock = KEYS[1]
local k_wait = KEYS[2]
local caller_id = ARGV[1]
local now = tonumber(ARGV[2])
local account_id = ARGV[3]

local existing = read_lock(k_lock, now)
if not existing then
  return cjson.encode({ outcome = "noop_no_lock" })
end
if existing.accountID ~= account_id then
  return cjson.encode({ outcome = "noop_no_lock" })
end
if existing.holderSessionID == "" then
  return cjson.encode({ outcome = "noop_no_lock" })
end
if existing.holderSessionID == caller_id then
  return cjson.encode({ outcome = "noop_same_holder" })
end

local prev = existing.holderSessionID
redis.call("DEL", k_lock)
redis.call("DEL", k_wait)
return cjson.encode({
  outcome = "released",
  previousHolderSessionID = prev,
})
`)

type forceReleaseSameAccountTxResult struct {
	Outcome                 string `json:"outcome"`
	PreviousHolderSessionID string `json:"previousHolderSessionID,omitempty"`
}

func runForceReleaseSameAccountTx(ctx context.Context, rdb *redis.Client, accountID, callerSessionID, collection, docID string, now int64) (*forceReleaseSameAccountTxResult, error) {
	raw, err := forceReleaseSameAccountScript.Run(
		ctx,
		rdb,
		[]string{
			LockKey(accountID, collection, docID),
			waitlistKey(accountID, collection, docID),
		},
		callerSessionID,
		now,
		accountID,
	).Text()
	if err != nil {
		return nil, fmt.Errorf("force-release same-account tx: %w", err)
	}
	var out forceReleaseSameAccountTxResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, fmt.Errorf("force-release same-account tx: decode: %w", err)
	}
	return &out, nil
}

// handOverLockScript implements `Service.HandOver` as one EVAL.
//
//	KEYS[1]  = lock key
//	KEYS[2]  = waitlist key
//	ARGV[1]  = pulse-key prefix (includes trailing separator)
//	ARGV[2]  = accountID
//	ARGV[3]  = sessionID (holder)
//	ARGV[4]  = now (unix seconds)
//	ARGV[5]  = ttl seconds
//
// Outcome JSON:
//
//	{
//	  "outcome": "promoted" | "released_no_queue" | "noop",
//	  "newHolderSessionID": "",
//	  "previousHolderSessionID": "",
//	  "expiresAtUnix": 0
//	}
var handOverLockScript = redis.NewScript(readLockLuaFn + writeLockLuaFn + findAliveHeadLuaFn + `
local k_lock = KEYS[1]
local k_wait = KEYS[2]
local pulse_prefix = ARGV[1]
local account_id = ARGV[2]
local holder_id = ARGV[3]
local now = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

local existing = read_lock(k_lock, now)
if not existing or existing.holderSessionID ~= holder_id then
  return cjson.encode({ outcome = "noop" })
end

local head = find_alive_head(k_wait, pulse_prefix)
if not head then
  redis.call("DEL", k_lock)
  return cjson.encode({
    outcome = "released_no_queue",
    previousHolderSessionID = holder_id,
  })
end

local exp = now + ttl
local rec = {
  holderSessionID = head,
  accountID = account_id,
  expiresAtUnix = exp,
}
write_lock(k_lock, rec, ttl)
redis.call("LREM", k_wait, 1, head)

return cjson.encode({
  outcome = "promoted",
  newHolderSessionID = head,
  previousHolderSessionID = holder_id,
  expiresAtUnix = exp,
})
`)

type handOverTxResult struct {
	Outcome                 string `json:"outcome"`
	NewHolderSessionID      string `json:"newHolderSessionID,omitempty"`
	PreviousHolderSessionID string `json:"previousHolderSessionID,omitempty"`
	ExpiresAtUnix           int64  `json:"expiresAtUnix,omitempty"`
}

func runHandOverTx(
	ctx context.Context,
	rdb *redis.Client,
	accountID, holderSessionID, collection, docID string,
	now, ttlSeconds int64,
) (*handOverTxResult, error) {
	raw, err := handOverLockScript.Run(
		ctx,
		rdb,
		[]string{
			LockKey(accountID, collection, docID),
			waitlistKey(accountID, collection, docID),
		},
		waitlistPulseKeyPrefix(accountID, collection, docID),
		accountID,
		holderSessionID,
		now,
		ttlSeconds,
	).Text()
	if err != nil {
		return nil, fmt.Errorf("hand-over tx: %w", err)
	}
	var out handOverTxResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, fmt.Errorf("hand-over tx: decode: %w", err)
	}
	return &out, nil
}

// requestAccessScript implements `Service.RequestAccess` as one EVAL.
//
//	KEYS[1]  = lock key
//	KEYS[2]  = waitlist key
//	KEYS[3]  = requester's pulse key
//	ARGV[1]  = accountID
//	ARGV[2]  = requester sessionID
//	ARGV[3]  = now (unix seconds)
//	ARGV[4]  = ttl seconds
//	ARGV[5]  = pulse TTL seconds
//
// Outcome JSON:
//
//	{ "outcome": "granted_empty" | "same_holder" | "queued", "record": {...}, "expiresAtUnix": 0 }
var requestAccessScript = redis.NewScript(readLockLuaFn + writeLockLuaFn + `
local k_lock = KEYS[1]
local k_wait = KEYS[2]
local k_pulse = KEYS[3]
local account_id = ARGV[1]
local requester = ARGV[2]
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local pulse_ttl = tonumber(ARGV[5])

local existing = read_lock(k_lock, now)
if not existing or not existing.holderSessionID or existing.holderSessionID == "" then
  local exp = now + ttl
  local rec = {
    holderSessionID = requester,
    accountID = account_id,
    expiresAtUnix = exp,
  }
  write_lock(k_lock, rec, ttl)
  return cjson.encode({
    outcome = "granted_empty",
    record = rec,
    expiresAtUnix = exp,
  })
end

if existing.holderSessionID == requester then
  return cjson.encode({
    outcome = "same_holder",
    record = existing,
    expiresAtUnix = existing.expiresAtUnix,
  })
end

-- Dedup + RPUSH so a re-request lands at the tail (matches EnqueueWaitlistUnique).
redis.call("LREM", k_wait, 1, requester)
redis.call("RPUSH", k_wait, requester)
redis.call("SET", k_pulse, "1", "EX", pulse_ttl)

existing.leaseMode = "contested"
existing.extendCount = 0
existing.expiresAtUnix = now + ttl
write_lock(k_lock, existing, ttl)

return cjson.encode({
  outcome = "queued",
  record = existing,
})
`)

type requestAccessTxResult struct {
	Outcome       string                    `json:"outcome"`
	Record        docLockTxResultLockRecord `json:"record"`
	ExpiresAtUnix int64                     `json:"expiresAtUnix,omitempty"`
}

func runRequestAccessTx(
	ctx context.Context,
	rdb *redis.Client,
	accountID, requesterSessionID, collection, docID string,
	now, ttlSeconds, pulseTTLSeconds int64,
) (*requestAccessTxResult, error) {
	raw, err := requestAccessScript.Run(
		ctx,
		rdb,
		[]string{
			LockKey(accountID, collection, docID),
			waitlistKey(accountID, collection, docID),
			waitlistPulseKey(accountID, collection, docID, requesterSessionID),
		},
		accountID,
		requesterSessionID,
		now,
		ttlSeconds,
		pulseTTLSeconds,
	).Text()
	if err != nil {
		return nil, fmt.Errorf("request-access tx: %w", err)
	}
	var out requestAccessTxResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, fmt.Errorf("request-access tx: decode: %w", err)
	}
	return &out, nil
}

// claimHandoffScript implements `Service.ClaimHandoff` as one EVAL.
//
//	KEYS[1]  = lock key
//	KEYS[2]  = waitlist key
//	KEYS[3]  = requester's pulse key
//	ARGV[1]  = accountID
//	ARGV[2]  = requester sessionID
//	ARGV[3]  = now (unix seconds)
//	ARGV[4]  = ttl seconds
//	ARGV[5]  = pulse TTL seconds
//
// Outcome JSON:
//
//	{
//	  "outcome": "granted" | "lock_inactive" | "no_active_probe" | "already_editing" | "not_next_in_queue",
//	  "previousHolderSessionID": "",
//	  "newHolderSessionID": "",
//	  "expiresAtUnix": 0
//	}
var claimHandoffScript = redis.NewScript(readLockLuaFn + writeLockLuaFn + `
local k_lock = KEYS[1]
local k_wait = KEYS[2]
local k_pulse = KEYS[3]
local account_id = ARGV[1]
local requester = ARGV[2]
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local pulse_ttl = tonumber(ARGV[5])

local existing = read_lock(k_lock, now)
if not existing then
  return cjson.encode({ outcome = "lock_inactive" })
end
if not existing.probeTargetSessionID or existing.probeTargetSessionID ~= requester
   or not existing.probeExpiresAtUnix or now >= tonumber(existing.probeExpiresAtUnix) then
  return cjson.encode({ outcome = "no_active_probe" })
end
if existing.holderSessionID == requester then
  return cjson.encode({ outcome = "already_editing" })
end

-- Touch pulse so the head-of-queue read below sees this session as alive.
redis.call("SET", k_pulse, "1", "EX", pulse_ttl)

local head = redis.call("LINDEX", k_wait, 0)
if not head or head == false or head ~= requester then
  return cjson.encode({ outcome = "not_next_in_queue" })
end

local exp = now + ttl
local old_holder = existing.holderSessionID
local rec = {
  holderSessionID = requester,
  accountID = account_id,
  expiresAtUnix = exp,
}
write_lock(k_lock, rec, ttl)
redis.call("LREM", k_wait, 1, requester)

return cjson.encode({
  outcome = "granted",
  previousHolderSessionID = old_holder,
  newHolderSessionID = requester,
  expiresAtUnix = exp,
})
`)

type claimHandoffTxResult struct {
	Outcome                 string `json:"outcome"`
	PreviousHolderSessionID string `json:"previousHolderSessionID,omitempty"`
	NewHolderSessionID      string `json:"newHolderSessionID,omitempty"`
	ExpiresAtUnix           int64  `json:"expiresAtUnix,omitempty"`
}

func runClaimHandoffTx(
	ctx context.Context,
	rdb *redis.Client,
	accountID, requesterSessionID, collection, docID string,
	now, ttlSeconds, pulseTTLSeconds int64,
) (*claimHandoffTxResult, error) {
	raw, err := claimHandoffScript.Run(
		ctx,
		rdb,
		[]string{
			LockKey(accountID, collection, docID),
			waitlistKey(accountID, collection, docID),
			waitlistPulseKey(accountID, collection, docID, requesterSessionID),
		},
		accountID,
		requesterSessionID,
		now,
		ttlSeconds,
		pulseTTLSeconds,
	).Text()
	if err != nil {
		return nil, fmt.Errorf("claim-handoff tx: %w", err)
	}
	var out claimHandoffTxResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, fmt.Errorf("claim-handoff tx: decode: %w", err)
	}
	return &out, nil
}

// promoteWaitlistScript implements `PromoteWaitlistHead` as one EVAL — used
// by the expiry subscriber (and by HandOver historically; HandOver now has
// its own script).
//
//	KEYS[1]  = lock key
//	KEYS[2]  = waitlist key
//	ARGV[1]  = pulse-key prefix (includes trailing separator)
//	ARGV[2]  = accountID
//	ARGV[3]  = now (unix seconds)
//	ARGV[4]  = ttl seconds
//
// Outcome JSON:
//
//	{ "outcome": "promoted" | "no_alive_head", "newHolderSessionID": "", "expiresAtUnix": 0 }
var promoteWaitlistScript = redis.NewScript(writeLockLuaFn + findAliveHeadLuaFn + `
local k_lock = KEYS[1]
local k_wait = KEYS[2]
local pulse_prefix = ARGV[1]
local account_id = ARGV[2]
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local head = find_alive_head(k_wait, pulse_prefix)
if not head then
  return cjson.encode({ outcome = "no_alive_head" })
end

local exp = now + ttl
local rec = {
  holderSessionID = head,
  accountID = account_id,
  expiresAtUnix = exp,
}
write_lock(k_lock, rec, ttl)
redis.call("LREM", k_wait, 1, head)

return cjson.encode({
  outcome = "promoted",
  newHolderSessionID = head,
  expiresAtUnix = exp,
})
`)

type promoteWaitlistTxResult struct {
	Outcome            string `json:"outcome"`
	NewHolderSessionID string `json:"newHolderSessionID,omitempty"`
	ExpiresAtUnix      int64  `json:"expiresAtUnix,omitempty"`
}

func runPromoteWaitlistTx(
	ctx context.Context,
	rdb *redis.Client,
	accountID, collection, docID string,
	now, ttlSeconds int64,
) (*promoteWaitlistTxResult, error) {
	raw, err := promoteWaitlistScript.Run(
		ctx,
		rdb,
		[]string{
			LockKey(accountID, collection, docID),
			waitlistKey(accountID, collection, docID),
		},
		waitlistPulseKeyPrefix(accountID, collection, docID),
		accountID,
		now,
		ttlSeconds,
	).Text()
	if err != nil {
		return nil, fmt.Errorf("promote-waitlist tx: %w", err)
	}
	var out promoteWaitlistTxResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, fmt.Errorf("promote-waitlist tx: decode: %w", err)
	}
	return &out, nil
}

// waitlistPulseKeyPrefix returns the pulse key for (account, coll, doc) with
// no trailing sessionID — Lua concatenates the candidate sessionID to it
// while walking the waitlist.
func waitlistPulseKeyPrefix(accountID, collection, docID string) string {
	return pulsePrefix + accountID + KeyPartSep + collection + KeyPartSep + docID + KeyPartSep
}
