package ledgerbench

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Scheme records one charge and reports what the window currently holds, in a
// single round trip, the way the limiter does.
type Scheme interface {
	Name() string
	Charge(ctx context.Context, rdb *redis.Client, key, class, endpoint string, cost int) (spent int, err error)
	Reset(ctx context.Context, rdb *redis.Client, key string) error
	// Prefill stages calls as they would really have arrived — spread across the
	// window rather than in the instant a loop can issue them. Without it a fast
	// loop lands every charge in one or two slots, and any scheme whose read
	// cost tracks how many slots are occupied looks far better than it is.
	Prefill(ctx context.Context, rdb *redis.Client, key, class, endpoint string, calls int) error
}

// WindowSeconds is ESI's window, and SlotSeconds how coarsely the slot scheme
// groups charges within it.
const (
	WindowSeconds  = 900
	SlotSeconds    = 5
	SlotsPerWindow = WindowSeconds / SlotSeconds
)

// ledgerScheme is today's design: one member per call, walked in full.
type ledgerScheme struct{ script *redis.Script }

func Ledger() Scheme {
	return &ledgerScheme{script: redis.NewScript(`
local key, class, endpoint, cost, window = KEYS[1], ARGV[1], ARGV[2], tonumber(ARGV[3]), tonumber(ARGV[4])
local time = redis.call('TIME')
local t = tonumber(time[1]) + tonumber(time[2]) / 1e6

redis.call('ZREMRANGEBYSCORE', key, '-inf', string.format('%.6f', t))

local spent, spent_endpoint = 0, 0
local by_class = {}
local live = redis.call('ZRANGE', key, 0, -1)
for i = 1, #live do
  local c, mclass, mendpoint = string.match(live[i], '^[^:]*:([^:]*):([^:]*):(.*)$')
  local v = tonumber(c) or 0
  spent = spent + v
  by_class[mclass] = (by_class[mclass] or 0) + v
  if mendpoint == endpoint then spent_endpoint = spent_endpoint + v end
end

local id = redis.sha1hex(key .. ':' .. tostring(t) .. ':' .. tostring(#live))
redis.call('ZADD', key, t + window, id .. ':' .. tostring(cost) .. ':' .. class .. ':' .. endpoint)
redis.call('EXPIRE', key, window * 2)
return spent
`)}
}

func (s *ledgerScheme) Name() string { return "ledger" }

func (s *ledgerScheme) Charge(ctx context.Context, rdb *redis.Client, key, class, endpoint string, cost int) (int, error) {
	n, err := s.script.Run(ctx, rdb, []string{key + ":ledger"}, class, endpoint, cost, WindowSeconds).Int()
	if err != nil {
		return 0, fmt.Errorf("ledger charge: %w", err)
	}
	return n, nil
}

func (s *ledgerScheme) Reset(ctx context.Context, rdb *redis.Client, key string) error {
	return rdb.Del(ctx, key+":ledger").Err()
}

func (s *ledgerScheme) Prefill(ctx context.Context, rdb *redis.Client, key, class, endpoint string, calls int) error {
	now := float64(time.Now().Unix())
	pipe := rdb.Pipeline()
	for i := range calls {
		// Spread the expiries across the window, as staggered arrivals would.
		age := float64(i) / float64(calls) * WindowSeconds
		member := fmt.Sprintf("%d:1:%s:%s", i, class, endpoint)
		pipe.ZAdd(ctx, key+":ledger", redis.Z{Score: now + WindowSeconds - age, Member: member})
	}
	_, err := pipe.Exec(ctx)
	return err
}

// slotScheme groups charges into fixed time buckets and lets Redis expire them.
// Reading is one MGET per dimension over a computable set of keys, so its cost
// does not move with traffic.
type slotScheme struct{ script *redis.Script }

func Slots() Scheme {
	return &slotScheme{script: redis.NewScript(`
local prefix, class, endpoint = KEYS[1], ARGV[1], ARGV[2]
local cost, window, slot_size = tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5])
local time = redis.call('TIME')
local t = tonumber(time[1]) + tonumber(time[2]) / 1e6

local slot = math.floor(t / slot_size)
local first = slot - math.floor(window / slot_size) + 1

-- Slot names come from the clock, so the read needs no scan and no index.
local function total(suffix)
  local keys = {}
  for sl = first, slot do keys[#keys + 1] = prefix .. ':' .. sl .. suffix end
  local vals = redis.call('MGET', unpack(keys))
  local sum = 0
  for i = 1, #vals do sum = sum + (tonumber(vals[i]) or 0) end
  return sum
end

local spent = total('')
total(':c:' .. class)
total(':e:' .. endpoint)

-- EXPIREAT with an instant derived from the slot, so writing again does not
-- extend the slot's life the way EXPIRE would.
local expires = (slot + 1) * slot_size + window
for _, k in ipairs({prefix .. ':' .. slot, prefix .. ':' .. slot .. ':c:' .. class, prefix .. ':' .. slot .. ':e:' .. endpoint}) do
  redis.call('INCRBY', k, cost)
  redis.call('EXPIREAT', k, expires)
end
return spent
`)}
}

func (s *slotScheme) Name() string { return "slots" }

func (s *slotScheme) Charge(ctx context.Context, rdb *redis.Client, key, class, endpoint string, cost int) (int, error) {
	n, err := s.script.Run(ctx, rdb, []string{key + ":s"}, class, endpoint, cost, WindowSeconds, SlotSeconds).Int()
	if err != nil {
		return 0, fmt.Errorf("slot charge: %w", err)
	}
	return n, nil
}

func (s *slotScheme) Prefill(ctx context.Context, rdb *redis.Client, key, class, endpoint string, calls int) error {
	now := time.Now().Unix()
	slot := now / SlotSeconds
	pipe := rdb.Pipeline()
	for i := range calls {
		at := slot - int64(float64(i)/float64(calls)*SlotsPerWindow)
		for _, k := range []string{
			fmt.Sprintf("%s:s:%d", key, at),
			fmt.Sprintf("%s:s:%d:c:%s", key, at, class),
			fmt.Sprintf("%s:s:%d:e:%s", key, at, endpoint),
		} {
			pipe.IncrBy(ctx, k, 1)
			pipe.ExpireAt(ctx, k, time.Unix((at+1)*SlotSeconds+WindowSeconds, 0))
		}
	}
	_, err := pipe.Exec(ctx)
	return err
}

func (s *slotScheme) Reset(ctx context.Context, rdb *redis.Client, key string) error {
	keys, err := rdb.Keys(ctx, key+":s*").Result()
	if err != nil || len(keys) == 0 {
		return err
	}
	return rdb.Del(ctx, keys...).Err()
}

// hashScheme keeps one hash per bucket, a field per (slot, class, endpoint),
// and lets Redis expire the fields. HGETALL omits expired ones, so a read is a
// single command over exactly what is still live — no key-per-slot lookups and
// no clock arithmetic on the read path.
type hashScheme struct{ script *redis.Script }

func Hash() Scheme {
	return &hashScheme{script: redis.NewScript(`
local key, class, endpoint = KEYS[1], ARGV[1], ARGV[2]
local cost, window, slot_size = tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5])
local time = redis.call('TIME')
local t = tonumber(time[1]) + tonumber(time[2]) / 1e6

-- Expired fields are already gone, so everything returned is in the window.
local spent, spent_endpoint = 0, 0
local by_class = {}
local flat = redis.call('HGETALL', key)
for i = 1, #flat, 2 do
  local v = tonumber(flat[i + 1]) or 0
  spent = spent + v
  local fclass, fendpoint = string.match(flat[i], '^[^|]*|([^|]*)|(.*)$')
  by_class[fclass] = (by_class[fclass] or 0) + v
  if fendpoint == endpoint then spent_endpoint = spent_endpoint + v end
end

local slot = math.floor(t / slot_size)
local field = slot .. '|' .. class .. '|' .. endpoint
redis.call('HINCRBY', key, field, cost)
-- Absolute, so writing into a slot again does not extend its life.
redis.call('HEXPIREAT', key, (slot + 1) * slot_size + window, 'FIELDS', 1, field)
return spent
`)}
}

func (s *hashScheme) Name() string { return "hash" }

func (s *hashScheme) Charge(ctx context.Context, rdb *redis.Client, key, class, endpoint string, cost int) (int, error) {
	n, err := s.script.Run(ctx, rdb, []string{key + ":h"}, class, endpoint, cost, WindowSeconds, SlotSeconds).Int()
	if err != nil {
		return 0, fmt.Errorf("hash charge: %w", err)
	}
	return n, nil
}

func (s *hashScheme) Reset(ctx context.Context, rdb *redis.Client, key string) error {
	return rdb.Del(ctx, key+":h").Err()
}

func (s *hashScheme) Prefill(ctx context.Context, rdb *redis.Client, key, class, endpoint string, calls int) error {
	now := time.Now().Unix()
	slot := now / SlotSeconds
	pipe := rdb.Pipeline()
	for i := range calls {
		at := slot - int64(float64(i)/float64(calls)*SlotsPerWindow)
		field := fmt.Sprintf("%d|%s|%s", at, class, endpoint)
		pipe.HIncrBy(ctx, key+":h", field, 1)
		pipe.Do(ctx, "HEXPIREAT", key+":h", (at+1)*SlotSeconds+WindowSeconds, "FIELDS", 1, field)
	}
	_, err := pipe.Exec(ctx)
	return err
}
