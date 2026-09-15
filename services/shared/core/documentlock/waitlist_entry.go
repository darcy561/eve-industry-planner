package documentlock

import "strings"

// A waitlist entry is `{sessionID}{KeyPartSep}{accountID}`.
//
// The account rides on the entry because promoting the queue's head writes a
// lock record, and that record names the holder's account — which force-release
// compares against the caller's. A queue of bare session ids cannot say whose
// they are, and on a shared planner the session promoted can belong to a member
// other than the one whose lock expired.
//
// One value rather than a map beside the queue: two structures would have to be
// kept in step through every enqueue, promotion and removal, and a removal that
// missed would leave the account behind for a session that is no longer waiting.
//
// Neither half can contain KeyPartSep — the same property the keys rely on.

// waitlistEntry renders the value stored on the queue.
func waitlistEntry(sessionID, accountID string) string {
	return sessionID + KeyPartSep + accountID
}

// parseWaitlistEntry splits a stored entry.
//
// An entry carrying no separator is reported as unusable rather than read as a
// bare session id. Such an entry names no account, so promoting it would write a
// record force-release could not judge; the queue's TTL clears them without a
// migration, and the readers below drop one as they would a stale entry.
func parseWaitlistEntry(entry string) (sessionID, accountID string, ok bool) {
	sessionID, accountID, found := strings.Cut(entry, KeyPartSep)
	if !found || sessionID == "" || accountID == "" {
		return "", "", false
	}
	return sessionID, accountID, true
}

// waitlistEntryLuaFn is inserted at the top of every script that reads the
// queue. It mirrors the two functions above, and `wl_remove_session` removes an
// entry a script knows only the session of — LREM matches on the whole value, so
// a caller holding a bare session id cannot name the entry to remove.
const waitlistEntryLuaFn = `
local WL_SEP = "\30"

local function wl_session(entry)
  local i = string.find(entry, WL_SEP, 1, true)
  if not i or i == 1 then
    return nil
  end
  return string.sub(entry, 1, i - 1)
end

local function wl_account(entry)
  local i = string.find(entry, WL_SEP, 1, true)
  if not i then
    return nil
  end
  local acct = string.sub(entry, i + 1)
  if acct == "" then
    return nil
  end
  return acct
end

local function wl_remove_session(k_wait, session)
  local entries = redis.call("LRANGE", k_wait, 0, 255)
  for i = 1, #entries do
    if wl_session(entries[i]) == session then
      redis.call("LREM", k_wait, 1, entries[i])
      return true
    end
  end
  return false
end
`
