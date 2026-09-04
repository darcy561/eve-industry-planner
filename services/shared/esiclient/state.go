package esiclient

import (
	"context"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// BucketState is what ESI last told us about a bucket, plus our own clock.
// Limit, Window and Metered are observations; nothing in code supplies them.
type BucketState struct {
	Limit      int
	Window     time.Duration
	Metered    bool
	Remaining  int
	ObservedAt time.Time
	GatedUntil time.Time
	NextSlot   time.Time
	ProbeUntil time.Time
	Spent      int
}

// Known reports whether a response has ever disclosed this bucket's allowance.
func (s BucketState) Known() bool { return s.Limit > 0 }

// Headroom is what a scheduler asks before publishing work. It is scoped to a
// class: what bulk may spend is not what the bucket holds.
type Headroom struct {
	Bucket Bucket
	Class  Class
	// Known is false until a response has disclosed the bucket's allowance.
	// Available is 0 in that case, which is not the same as having no budget:
	// nothing has said yet. Callers must not read it as a refusal.
	Known      bool
	Available  int
	Requests   int
	ResetAt    time.Time
	GatedUntil time.Time
	Sustained  float64
}

// Reservation is a granted slot. Every one is settled or released.
type Reservation struct {
	ID       string
	Bucket   Bucket
	Class    Class
	Endpoint string
	Slot     time.Time
	Cost     int
	Probe    bool
}

// Outcome is what a reservation turned into, for Settle.
type Outcome struct {
	// Attempted says a request actually reached the network. A reservation that
	// was released without being sent is not evidence about availability, and
	// must not be mistaken for the server failing to answer.
	Attempted  bool
	Status     int
	Cost       int
	ObservedAt time.Time
	Limit      int
	Window     time.Duration
	Remaining  int
	RetryAfter time.Duration
	Metered    bool
}

// Store is the Redis side of the limiter: the reservation clock, the token
// ledger, and what responses have disclosed. It knows nothing about HTTP and
// nothing about anything waiting.
type Store struct {
	redis   *redis.Client
	cfg     Config
	reserve *redis.Script
	settle  *redis.Script
	observe *redis.Script
}

// NewStore binds the scripts to a Redis client.
func NewStore(client *redis.Client, cfg Config) *Store {
	return &Store{
		redis:   client,
		cfg:     cfg,
		reserve: redis.NewScript(reserveScript),
		settle:  redis.NewScript(settleScript),
		observe: redis.NewScript(observeScript),
	}
}

// Grant is the answer to a reservation request: slots, or when to come back.
type Grant struct {
	Granted      bool
	Kind         Kind
	RetryAt      time.Time
	Reservations []Reservation
	State        BucketState
	Available    int
}

// Reserve asks for count slots in a bucket. It never blocks: either slots come
// back with the times they mature, or a Kind and a time to return.
func (s *Store) Reserve(ctx context.Context, b Bucket, class Class, policy EndpointPolicy, count int) (Grant, error) {
	if count <= 0 {
		count = 1
	}
	spacing := policy.MinSpacing
	if spacing <= 0 {
		spacing = 50 * time.Millisecond
	}
	glide := policy.GlideFrom
	if glide <= 0 {
		glide = s.cfg.GlideFrom
	}
	endpoint := policy.Pattern
	if endpoint == "" {
		endpoint = "-"
	}

	raw, err := s.reserve.Run(ctx, s.redis,
		[]string{stateKey(b), ledgerKey(b), errorKey(time.Now()), downtimeKey},
		count,
		SuccessCost,
		strconv.Itoa(int(class)),
		s.cfg.floorsSpec(),
		policy.MaxShare,
		spacing.Seconds(),
		glide,
		s.cfg.ProbeTTL.Seconds(),
		s.cfg.ErrorLimitStop,
		endpoint,
		downtimeProbeTTL.Seconds(),
	).Result()
	if err != nil {
		return Grant{}, fmt.Errorf("reserve %s: %w", b, err)
	}
	return parseGrant(raw, b, class, endpoint)
}

// Settle reconciles one reservation against what its response cost, and folds in
// whatever that response disclosed about the bucket. Release is Settle with a
// zero cost.
func (s *Store) Settle(ctx context.Context, r Reservation, out Outcome) error {
	observed := out.ObservedAt
	if observed.IsZero() {
		observed = time.Now()
	}
	remaining := out.Remaining
	if out.Limit <= 0 {
		remaining = -1
	}

	// 1 the server answered, -1 it did not, 0 we never asked.
	availability := 0
	switch {
	case !out.Attempted:
	case out.Status >= 200 && out.Status < 500:
		availability = 1
	default:
		availability = -1
	}

	_, err := s.settle.Run(ctx, s.redis,
		[]string{stateKey(r.Bucket), ledgerKey(r.Bucket), errorKey(observed), downtimeKey},
		r.ID,
		out.Cost,
		strconv.Itoa(int(r.Class)),
		r.Endpoint,
		out.Status,
		float64(observed.UnixNano())/1e9,
		out.Limit,
		int(out.Window.Seconds()),
		remaining,
		out.RetryAfter.Seconds(),
		boolToInt(out.Metered),
		availability,
		failuresBeforeConcluding,
		downtimeProbeFirst.Seconds(),
		downtimeProbeMax.Seconds(),
		sourcesToTripDowntime,
		loneSourceFailures,
	).Result()
	if err != nil {
		return fmt.Errorf("settle %s: %w", r.Bucket, err)
	}
	return nil
}

// Release drops a reservation whose request never happened. It says nothing
// about whether the server is up.
func (s *Store) Release(ctx context.Context, r Reservation) error {
	return s.Settle(ctx, r, Outcome{ObservedAt: time.Now(), Metered: true})
}

// SettleUnreachable records a reservation whose request was sent and produced no
// response, which is evidence the server is away.
func (s *Store) SettleUnreachable(ctx context.Context, r Reservation) error {
	return s.Settle(ctx, r, Outcome{Attempted: true, ObservedAt: time.Now(), Metered: true})
}

// State reads what is known about a bucket.
func (s *Store) State(ctx context.Context, b Bucket) (BucketState, error) {
	fields, err := s.redis.HGetAll(ctx, stateKey(b)).Result()
	if err != nil {
		return BucketState{}, fmt.Errorf("state %s: %w", b, err)
	}
	state := stateFromFields(fields)

	if state.Metered {
		spent, err := s.spend(ctx, b)
		if err != nil {
			return state, err
		}
		state.Spent = spent
	}
	return state, nil
}

// Headroom reports what one class may spend in a bucket now, so a scheduler can
// decide whether to publish work rather than let it bounce later.
func (s *Store) Headroom(ctx context.Context, b Bucket, class Class) (Headroom, error) {
	state, err := s.State(ctx, b)
	if err != nil {
		return Headroom{}, err
	}
	return s.headroomFrom(state, b, class), nil
}

// CanAfford is Headroom against a threshold, for the common scheduler question.
//
// An allowance nothing has disclosed yet affords the work. Refusing it would
// deadlock: the allowance is only ever learned from a call, so a caller that
// waits for a budget before calling waits forever. The limiter admits one
// caller to discover it and paces the rest.
func (s *Store) CanAfford(ctx context.Context, b Bucket, class Class, tokens int) (bool, Headroom, error) {
	room, err := s.Headroom(ctx, b, class)
	if err != nil {
		return false, Headroom{}, err
	}
	if !room.GatedUntil.IsZero() {
		return false, room, nil
	}
	if !room.Known {
		return true, room, nil
	}
	return room.Available >= tokens, room, nil
}

func (s *Store) headroomFrom(state BucketState, b Bucket, class Class) Headroom {
	room := Headroom{Bucket: b, Class: class, GatedUntil: state.GatedUntil, Known: state.Known()}
	if !room.Known {
		return room
	}

	bucketAvailable := state.Limit - state.Spent
	if state.ObservedAt.After(time.Now().Add(-state.Window)) && state.Remaining >= 0 {
		bucketAvailable = min(bucketAvailable, state.Remaining)
	}
	bucketAvailable = max(bucketAvailable, 0)

	// What this class may take is everything the others are not owed, or its
	// share of what remains — the same rule the reserve script applies.
	available := max(
		bucketAvailable-int(s.cfg.reservedForOthers(class)*float64(state.Limit)),
		int(s.cfg.floorShare(class)*float64(bucketAvailable)),
	)

	room.Available = max(available, 0)
	room.Requests = room.Available / SuccessCost
	room.Sustained = float64(state.Limit) / state.Window.Seconds() / SuccessCost
	room.ResetAt = state.ObservedAt.Add(state.Window)
	return room
}

func (s *Store) spend(ctx context.Context, b Bucket) (int, error) {
	members, err := s.redis.ZRangeByScore(ctx, ledgerKey(b), &redis.ZRangeBy{
		Min: strconv.FormatFloat(float64(time.Now().UnixNano())/1e9, 'f', 6, 64),
		Max: "+inf",
	}).Result()
	if err != nil {
		return 0, fmt.Errorf("ledger %s: %w", b, err)
	}

	total := 0
	for _, member := range members {
		total += costFromMember(member)
	}
	return total, nil
}

// Observe records whether the servers answered, from a caller that has no
// bucket and spends no token.
//
// EVE SSO is the case this exists for: token rotation talks to
// login.eveonline.com, is stopped by the same outage as everything else, and is
// not rate limited. Its failures are evidence like any other, and its successes
// clear the gate — if SSO is answering, the servers are back.
//
// source names where the observation came from. An outage is concluded from
// failures spreading across sources, so SSO counts as one rather than being
// folded into a bucket it does not have.
func (s *Store) Observe(ctx context.Context, source string, reachable bool) error {
	availability := -1
	if reachable {
		availability = 1
	}

	_, err := s.observe.Run(ctx, s.redis,
		[]string{downtimeKey},
		"source:"+source,
		availability,
		float64(time.Now().UnixNano())/1e9,
		failuresBeforeConcluding,
		downtimeProbeFirst.Seconds(),
		downtimeProbeMax.Seconds(),
		sourcesToTripDowntime,
		loneSourceFailures,
	).Result()
	if err != nil {
		return fmt.Errorf("observe %s: %w", source, err)
	}
	return nil
}

// Downtime reports what the fleet currently believes about availability.
func (s *Store) Downtime(ctx context.Context) (DowntimeState, error) {
	fields, err := s.redis.HGetAll(ctx, downtimeKey).Result()
	if err != nil {
		return DowntimeState{}, fmt.Errorf("downtime: %w", err)
	}
	return DowntimeState{
		Gated:     fields["gated"] == "1",
		NextProbe: unixFloat(fields["next_probe"]),
		Failures:  atoiOr(fields["failures"], 0),
		LastOK:    unixFloat(fields["last_ok"]),
	}, nil
}

// LearnGroup records which rate limit group a path belongs to, as the response
// disclosed it, so the next call to that path knows its bucket before it starts.
func (s *Store) LearnGroup(ctx context.Context, path, group string) error {
	if path == "" || group == "" {
		return nil
	}
	return s.redis.Set(ctx, pathKey(path), group, 24*time.Hour).Err()
}

// GroupFor returns the group a path was last seen to belong to.
func (s *Store) GroupFor(ctx context.Context, path string) (string, bool, error) {
	group, err := s.redis.Get(ctx, pathKey(path)).Result()
	switch {
	case err == redis.Nil:
		return "", false, nil
	case err != nil:
		return "", false, fmt.Errorf("group for %s: %w", path, err)
	default:
		return group, group != "", nil
	}
}

// ErrorCount is how many non-2xx/3xx responses the fleet has taken this minute,
// which the 420 guard watches.
func (s *Store) ErrorCount(ctx context.Context) (int, error) {
	count, err := s.redis.Get(ctx, errorKey(time.Now())).Int()
	switch {
	case err == redis.Nil:
		return 0, nil
	case err != nil:
		return 0, fmt.Errorf("error count: %w", err)
	default:
		return count, nil
	}
}

// Buckets is every bucket Redis holds state for, for gauges and for the
// operator CLI. The fleet shares this state, so it reports what every replica
// has learned, not only what this process has touched.
func (s *Store) Buckets(ctx context.Context) ([]Bucket, error) {
	const suffix = ":state"
	prefix := keyPrefix + "b:"

	var out []Bucket
	var cursor uint64
	for {
		keys, next, err := s.redis.Scan(ctx, cursor, prefix+"*"+suffix, 200).Result()
		if err != nil {
			return nil, fmt.Errorf("scan bucket state: %w", err)
		}
		for _, key := range keys {
			name, ok := strings.CutPrefix(key, prefix)
			if !ok {
				continue
			}
			name, ok = strings.CutSuffix(name, suffix)
			if !ok {
				continue
			}
			group, user, ok := strings.Cut(name, "|")
			if !ok {
				continue
			}
			out = append(out, Bucket{Group: group, User: user})
		}
		if next == 0 {
			break
		}
		cursor = next
	}
	slices.SortFunc(out, func(a, b Bucket) int { return strings.Compare(a.Key(), b.Key()) })
	return out, nil
}

// Forget drops the allowance the limiter learned from ESI, so the next call
// rediscovers it. Everything else about the bucket is left alone.
//
// Two things must survive, and deleting the whole state hash destroys both.
// The ledger records spend inside a window ESI is still counting, so dropping
// it lets every replica spend the same budget again and earn a 429. The
// "metered" flag is what makes the limiter consult that ledger at all — clear
// it and the bucket is treated as untracked, which spends without accounting
// just as effectively as an empty ledger would.
//
// With the allowance gone and metered intact, the bucket falls into discovery:
// one caller probes, the rest wait on it, and normal accounting resumes against
// the ledger that was never lost.
func (s *Store) Forget(ctx context.Context, b Bucket) (int64, error) {
	deleted, err := s.redis.HDel(ctx, stateKey(b), "limit", "window", "remaining", "observed_at").Result()
	if err != nil {
		return 0, fmt.Errorf("forget %s: %w", b.Key(), err)
	}
	return deleted, nil
}
