package ratelimiter

// Lua scripts for Redis-based rate limiting

const (
	// CheckAndReserveScript checks token bucket and rate limiter, returns {allowed, wait_until}
	// KEYS[1] = esi:group:{group}:tokens:zset (may not exist if no token restrictions)
	// KEYS[2] = esi:group:{group}:tokens:sum (may not exist if no token restrictions)
	// KEYS[3] = esi:group:{group}:rate:next_allowed
	// ARGV[1] = window duration (seconds)
	// ARGV[2] = token limit (-1 = no token restrictions, only rate limiting; > 0 = enforce token restrictions)
	// ARGV[3] = rate limit (req/s)
	CheckAndReserveScript = `
-- Use Redis time for consistency (eliminates clock skew)
local t = redis.call('TIME')
local now = tonumber(t[1]) + tonumber(t[2]) / 1e6
local window_duration = tonumber(ARGV[1])
local token_limit = tonumber(ARGV[2])
local rate_limit = tonumber(ARGV[3])
local min_interval = 1.0 / rate_limit

-- Only check token bucket if token restrictions are enforced
-- -1 means no token restrictions (rate limiting only)
local enforce_tokens = (token_limit > 0)

if enforce_tokens then
    -- Clean expired tokens and update sum atomically
    local cutoff = now - window_duration
    local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', cutoff, 'WITHSCORES')
    local expired_sum = 0
    if #expired > 0 then
        for i = 1, #expired, 2 do
            expired_sum = expired_sum + tonumber(expired[i])
        end
        redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
        if expired_sum > 0 then
            redis.call('DECRBY', KEYS[2], expired_sum)
        end
    end

    -- Check token bucket using O(1) sum (not O(N) scan)
    local current_sum = tonumber(redis.call('GET', KEYS[2]) or 0)
    if current_sum >= token_limit then
        -- Not enough tokens, find when oldest token expires
        -- This gives us the earliest time when tokens will be available
        local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
        if #oldest > 0 then
            -- Oldest token expires at: oldest_score + window_duration
            local oldest_score = tonumber(oldest[2])
            local wait_until = oldest_score + window_duration
            -- Add 200ms safety buffer to ensure wait_until is always in the future
            -- This prevents timing precision issues when converting to Go time.Time
            -- Redis + network + Go conversion + logging can exceed 100ms under load
            -- 200ms is conservative and cheap, still preserves 3 req/s accuracy (200ms << 333ms)
            local SAFETY_BUFFER = 0.2
            wait_until = wait_until + SAFETY_BUFFER
            -- Return error with retry time
            return {0, wait_until}  -- {allowed=false, wait_until}
        else
            -- No tokens in set (shouldn't happen if sum >= limit, but handle gracefully)
            -- Wait for full window duration as fallback, plus 200ms safety buffer
            local SAFETY_BUFFER = 0.2
            return {0, now + window_duration + SAFETY_BUFFER}  -- {allowed=false, wait_until}
        end
    end
end
-- If enforce_tokens is false, skip token bucket check (rate limiting only)

-- CRITICAL: Atomically check and update rate limiter
-- This applies to ALL groups (both with and without token restrictions)
local next_allowed_str = redis.call('GET', KEYS[3])
local next_allowed = now

if next_allowed_str then
    next_allowed = tonumber(next_allowed_str)
end

-- Ensure monotonicity (handle clock skew)
local base = math.max(now, next_allowed)

-- If we need to wait, return wait time
if base > now then
    -- Add 200ms safety buffer to ensure wait_until is always in the future
    -- This prevents timing precision issues when converting to Go time.Time
    -- Redis + network + Go conversion + logging can exceed 100ms under load
    -- 200ms is conservative and cheap, still preserves 3 req/s accuracy (200ms << 333ms)
    local SAFETY_BUFFER = 0.2
    local wait_until = base + SAFETY_BUFFER
    return {0, wait_until}  -- {allowed=false, wait_until}
end

-- We can proceed! Atomically update next_allowed time
-- Monotonic: always advances forward, never backwards
local new_next_allowed = base + min_interval
redis.call('SET', KEYS[3], new_next_allowed)

-- NOTE: We do NOT reserve tokens here (avoids double-counting)
-- Tokens are added in UpdateTokens after actual request completes
-- This is safe because asynq queues already throttle, and ESI responses are fast

return {1, now}  -- {allowed=true, make_request_at=now}
`

	// UpdateTokensScript updates token bucket after request completes
	// KEYS[1] = esi:group:{group}:tokens:zset (may not exist if no token restrictions)
	// KEYS[2] = esi:group:{group}:tokens:sum (may not exist if no token restrictions)
	// KEYS[3] = esi:path:{path}:group
	// ARGV[1] = actual tokens consumed
	// ARGV[2] = group name
	// ARGV[3] = token limit from headers (-1 = no token restrictions, > 0 = enforce token restrictions)
	UpdateTokensScript = `
-- Use Redis time for consistency
local t = redis.call('TIME')
local now = tonumber(t[1]) + tonumber(t[2]) / 1e6
local actual_tokens = tonumber(ARGV[1])
local token_limit = tonumber(ARGV[3] or -1)

-- Only update token bucket if token restrictions are enforced
-- -1 means no token restrictions (rate limiting only)
local enforce_tokens = (token_limit > 0)

if enforce_tokens then
    -- Initialize keys if they don't exist (first request for this group)
    local exists = redis.call('EXISTS', KEYS[1])
    if exists == 0 then
        -- First time seeing this group with token restrictions
        -- Keys will be created by ZADD and INCRBY
    end

    -- Add actual token consumption to sorted set
    redis.call('ZADD', KEYS[1], now, actual_tokens)

    -- Update running sum atomically (O(1) operation)
    redis.call('INCRBY', KEYS[2], actual_tokens)
else
    -- No token restrictions - only rate limiting is used
    -- Don't create or update token bucket keys
end

-- Update path to group mapping (always, regardless of token restrictions)
redis.call('SET', KEYS[3], ARGV[2])

-- Update token limit if provided (even if -1, to record that this group has no token restrictions)
if ARGV[3] then
    redis.call('SET', 'esi:group:' .. ARGV[2] .. ':token_limit', ARGV[3])
end

return {1}  -- success
`
)
