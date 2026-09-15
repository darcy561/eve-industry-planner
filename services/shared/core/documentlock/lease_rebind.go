package documentlock

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"
	eipredis "eve-industry-planner/shared/redis"
)

// rebindContestedLockScript shortens the holder lease to DefaultLockTTL when
// another session joins (viewer or waitlist). Preserves probe fields while a
// probe ack window is still active.
var rebindContestedLockScript = eipredis.Script(readLockLuaFn + writeLockLuaFn + `
local k_lock = KEYS[1]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local existing = read_lock(k_lock, now)
if not existing or not existing.holderSessionID or existing.holderSessionID == "" then
  return cjson.encode({ outcome = "noop" })
end

if existing.probeTargetSessionID and existing.probeTargetSessionID ~= "" and existing.probeExpiresAtUnix and now < tonumber(existing.probeExpiresAtUnix) then
  existing.expiresAtUnix = now + ttl
  existing.leaseMode = "contested"
  write_lock(k_lock, existing, ttl)
  return cjson.encode({
    outcome = "rebound_contested",
    record = existing,
    expiresAtUnix = existing.expiresAtUnix,
  })
end

existing.leaseMode = "contested"
existing.extendCount = 0
existing.probeTargetSessionID = ""
existing.probeExpiresAtUnix = 0
existing.expiresAtUnix = now + ttl
write_lock(k_lock, existing, ttl)
return cjson.encode({
  outcome = "rebound_contested",
  record = existing,
  expiresAtUnix = existing.expiresAtUnix,
})
`)

// rebindSoloLockScript lengthens the holder lease when uncontested again.
var rebindSoloLockScript = eipredis.Script(readLockLuaFn + writeLockLuaFn + `
local k_lock = KEYS[1]
local now = tonumber(ARGV[1])
local solo_ttl = tonumber(ARGV[2])

local existing = read_lock(k_lock, now)
if not existing or not existing.holderSessionID or existing.holderSessionID == "" then
  return cjson.encode({ outcome = "noop" })
end

existing.leaseMode = "solo"
existing.extendCount = 0
existing.probeTargetSessionID = ""
existing.probeExpiresAtUnix = 0
existing.expiresAtUnix = now + solo_ttl
write_lock(k_lock, existing, solo_ttl)
return cjson.encode({
  outcome = "rebound_solo",
  record = existing,
  expiresAtUnix = existing.expiresAtUnix,
})
`)

type rebindTxResult struct {
	Outcome       string                    `json:"outcome"`
	Record        docLockTxResultLockRecord `json:"record"`
	ExpiresAtUnix int64                     `json:"expiresAtUnix,omitempty"`
}

// RebindHolderLeaseContested moves the active holder into contested (5m) mode.
func RebindHolderLeaseContested(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID string) (*rebindTxResult, error) {
	if rdb.Driver() == nil {
		return nil, eipredis.ErrNoClient
	}
	now := time.Now().Unix()
	raw, err := rdb.Run(
		ctx,
		rebindContestedLockScript,
		[]string{LockKey(owner, collection, docID)},
		now,
		ContestedLockTTLSeconds(),
	).Text()
	if err != nil {
		return nil, fmt.Errorf("rebind contested: %w", err)
	}
	var out rebindTxResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, fmt.Errorf("rebind contested: decode: %w", err)
	}
	return &out, nil
}

// RebindHolderLeaseSolo moves the active holder into solo (long TTL) mode.
func RebindHolderLeaseSolo(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID string) (*rebindTxResult, error) {
	if rdb.Driver() == nil {
		return nil, eipredis.ErrNoClient
	}
	now := time.Now().Unix()
	raw, err := rdb.Run(
		ctx,
		rebindSoloLockScript,
		[]string{LockKey(owner, collection, docID)},
		now,
		SoloLockTTLSeconds(),
	).Text()
	if err != nil {
		return nil, fmt.Errorf("rebind solo: %w", err)
	}
	var out rebindTxResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, fmt.Errorf("rebind solo: decode: %w", err)
	}
	return &out, nil
}

// TryRebindHolderLeaseSoloIfUncontested switches back to solo when there are no
// viewers, no waitlist entries, and no active handoff probe.
func TryRebindHolderLeaseSoloIfUncontested(ctx context.Context, rdb *eipredis.Redis, owner models.Owner, collection, docID string) error {
	if rdb.Driver() == nil {
		return nil
	}
	rec, err := GetLock(ctx, rdb, owner, collection, docID)
	if err != nil || rec == nil || rec.HolderSessionID == "" {
		return err
	}
	if rec.LeaseMode == LeaseModeSolo {
		return nil
	}
	now := time.Now().Unix()
	if rec.ProbeTargetSessionID != "" && rec.ProbeExpiresAtUnix > now {
		return nil
	}
	vc, err := PruneAndCountViewers(ctx, rdb, owner, collection, docID)
	if err != nil {
		return err
	}
	if vc > 0 {
		return nil
	}
	wl, err := WaitlistLen(ctx, rdb, owner, collection, docID)
	if err != nil {
		return err
	}
	if wl > 0 {
		return nil
	}
	_, err = RebindHolderLeaseSolo(ctx, rdb, owner, collection, docID)
	return err
}
