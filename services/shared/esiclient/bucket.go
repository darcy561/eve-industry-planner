package esiclient

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Identity is the ESI-side principal a request is charged to. The zero value is
// an unauthenticated request.
type Identity struct {
	CharacterID int32
}

// User is the userID half of a bucket key, as ESI forms it: the character for an
// authenticated route, the source address for an anonymous one.
func (i Identity) User() string {
	if i.CharacterID == 0 {
		return AnonymousUser
	}
	return "char:" + strconv.FormatInt(int64(i.CharacterID), 10)
}

// AnonymousUser stands for this deployment's egress address, which ESI keys
// unauthenticated routes on. The fleet holds one such budget.
const AnonymousUser = "ip"

// Bucket is one ESI rate-limit bucket, keyed as ESI meters it: a rate limit
// group paired with a userID.
type Bucket struct {
	Group string
	User  string
}

// BucketFor pairs a group with the identity a call was made under.
func BucketFor(group string, id Identity) Bucket {
	return Bucket{Group: group, User: id.User()}
}

// Key is the Redis key segment for the bucket.
func (b Bucket) Key() string { return b.Group + "|" + b.User }

func (b Bucket) String() string { return b.Key() }

// Zero reports whether the bucket names nothing yet, which happens before a
// response has disclosed the group.
func (b Bucket) Zero() bool { return b.Group == "" }

// unknownGroupPrefix marks a group name that is a guess rather than something
// ESI disclosed.
const unknownGroupPrefix = "unknown:"

// Placeholder reports whether this bucket stands in for a group that has not
// been disclosed yet. Such a bucket is named per path, so it must never reach a
// metric label.
func (b Bucket) Placeholder() bool {
	return strings.HasPrefix(b.Group, unknownGroupPrefix)
}

// Redis keys. Every key this package reads or writes is built here.
const keyPrefix = "esi:"

func stateKey(b Bucket) string  { return keyPrefix + "b:" + b.Key() + ":state" }
func ledgerKey(b Bucket) string { return keyPrefix + "b:" + b.Key() + ":ledger" }
func pathKey(path string) string {
	return keyPrefix + "path:" + path + ":group"
}
func errorKey(at time.Time) string {
	return keyPrefix + "errors:" + strconv.FormatInt(at.Unix()/60, 10)
}

const downtimeKey = keyPrefix + "downtime"

// TokenCost is what ESI charges for a response, by status class. A 429 is
// excluded from the 4XX charge, and a 5XX is free.
//
// This is a property of the protocol rather than a per-bucket allowance, so it
// is the one figure here that is written down instead of observed. Tests check
// it against X-Ratelimit-Used so a change shows up as a failure.
func TokenCost(status int) int {
	switch {
	case status == http.StatusTooManyRequests:
		return 0
	case status >= 200 && status < 300:
		return 2
	case status >= 300 && status < 400:
		return 1
	case status >= 400 && status < 500:
		return 5
	case status >= 500:
		return 0
	default:
		return 2
	}
}

// SuccessCost is what a call is charged before its status is known. Reserving
// the 2xx cost and reconciling afterwards keeps concurrent callers from all
// admitting against the same tokens.
const SuccessCost = 2

// CountsTowardErrorLimit reports whether a status feeds the fleet-wide limit on
// non-2xx/3xx responses, which returns 420 across every ESI route when breached.
func CountsTowardErrorLimit(status int) bool {
	return status < 200 || status >= 400
}

// ParseLimit reads X-Ratelimit-Limit, which states an allowance and the window
// it refills over: "150/15m".
func ParseLimit(header string) (tokens int, window time.Duration, ok bool) {
	header = strings.TrimSpace(header)
	if header == "" {
		return 0, 0, false
	}

	count, period, found := strings.Cut(header, "/")
	tokens, err := strconv.Atoi(strings.TrimSpace(count))
	if err != nil || tokens <= 0 {
		return 0, 0, false
	}
	if !found {
		return 0, 0, false
	}

	window, err = time.ParseDuration(strings.TrimSpace(period))
	if err != nil || window <= 0 {
		return 0, 0, false
	}
	return tokens, window, true
}

// Class is who wanted the call, which is what decides queue order, the slice of
// a bucket it may spend, and how long it waits before giving up.
//
// There are two, because there are two answers: the backend decided to do this,
// or someone asked for it. A middle class for work a user triggered but is not
// waiting on earned its own floor and its own place in every scheduling decision
// while covering one endpoint, and made the distribution hard to reason about.
type Class uint8

const (
	// ClassBackground is work the backend decided to do: the cron refreshes and
	// the session affiliation sweep. Deferring it is not free but nobody is
	// watching, and stale work escalates rather than waiting forever.
	ClassBackground Class = iota
	// ClassUserRequested is work someone asked for and is waiting on.
	ClassUserRequested
)

func (c Class) String() string {
	switch c {
	case ClassBackground:
		return "background"
	case ClassUserRequested:
		return "user"
	default:
		return fmt.Sprintf("class(%d)", uint8(c))
	}
}
