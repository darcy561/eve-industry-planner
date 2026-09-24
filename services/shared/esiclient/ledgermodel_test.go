package esiclient_test

import (
	"flag"
	"math/rand/v2"
	"strconv"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"
)

// A slot counter holds no per-reservation identity, so the ledger's correctness
// rests on the caller reversing each hold exactly once. That is not visible in
// any single operation: it is a property of a whole sequence. These drive
// randomised sequences against the store and against a model that counts the
// same tokens the obvious way, and compare after every step.

var ledgerSeed = flag.Int64("ledger.seed", 0, "seed for the ledger property test; 0 picks one per run")

// ledgerModel is what the ledger should hold: every hold that has not been
// settled, plus what each settled call actually cost. It counts tokens and
// knows nothing of slots, floors or classes — the point is to be obviously
// right rather than to restate the script.
type ledgerModel struct {
	held    map[string]int
	settled map[esiclient.Bucket]int
}

func newLedgerModel() *ledgerModel {
	return &ledgerModel{held: make(map[string]int), settled: make(map[esiclient.Bucket]int)}
}

func (m *ledgerModel) reserve(r esiclient.Reservation) {
	m.held[r.ID] += r.Cost
}

// settle gives back what the reservation was holding and charges what the call
// really cost. Releasing is settling for nothing.
func (m *ledgerModel) settle(r esiclient.Reservation, cost int) {
	delete(m.held, r.ID)
	m.settled[r.Bucket] += cost
}

// move is a response disclosing that the call belonged to a different bucket:
// the hold goes back where it was taken from and the charge lands on the real
// bucket. The token count across the two is what must not change.
func (m *ledgerModel) move(r esiclient.Reservation, to esiclient.Bucket, cost int) {
	delete(m.held, r.ID)
	m.settled[to] += cost
}

// expire is a jump past a whole window, taken only when nothing is outstanding.
// Every field in the ledger carries a TTL derived from its slot, so a jump that
// long ages out every charge and the ledger is empty again.
//
// It is deliberately not taken while holds are live. miniredis.FastForward ages
// TTLs but does not move the clock the script reads from Redis TIME, so charges
// keep landing in the slot they were already in. A jump would then delete the
// field a live hold is sitting in while a later settle still reverses against
// it - a state real time never reaches, because there the slot moves on. Driving
// it would pin the harness's artifact rather than the limiter's contract.
func (m *ledgerModel) expire() {
	m.settled = make(map[esiclient.Bucket]int)
}

func (m *ledgerModel) total(b esiclient.Bucket, held map[string]esiclient.Bucket) int {
	total := m.settled[b]
	for id, cost := range m.held {
		if held[id] == b {
			total += cost
		}
	}
	return total
}

// ledgerTotal is what Redis holds, summed straight from the hash rather than
// through the store's own walk, so a fault in that walk cannot hide itself.
func ledgerTotal(t *testing.T, be backend, b esiclient.Bucket) int {
	t.Helper()
	fields, err := be.Client.HGetAll(t.Context(), "esi:b:"+b.Key()+":ledger").Result()
	if err != nil {
		t.Fatalf("read ledger: %v", err)
	}
	total := 0
	for field, value := range fields {
		cost, err := strconv.Atoi(value)
		if err != nil {
			t.Fatalf("ledger field %q holds %q, which is not a count", field, value)
		}
		if strings.Contains(field, esiclient.SyncMember) {
			// Reconciliation against what ESI says it charged the address. It is
			// not spend this fleet made, so the model does not predict it.
			continue
		}
		total += cost
	}
	return total
}

func TestLedgerMatchesAModelOfOutstandingAndSettled(t *testing.T) {
	seed := *ledgerSeed
	if seed == 0 {
		seed = time.Now().UnixNano()
	}
	t.Logf("seed %d - reproduce with -ledger.seed=%d", seed, seed)

	// Against the fake the window is long and time is skipped; against a real
	// server it is short enough to wait out, because expiry there is the wall
	// clock and nothing can fast-forward it. Both drive the same sequence.
	limit, window, steps := 400, 15*time.Minute, 300
	if newBackend(t).live() {
		window, steps = 3*time.Second, 120
	}

	store, be := newStore(t)
	guessed := esiclient.Bucket{Group: "model-guessed", User: esiclient.AnonymousUser}
	disclosed := esiclient.Bucket{Group: "model-disclosed", User: esiclient.AnonymousUser}
	buckets := []esiclient.Bucket{guessed, disclosed}

	model := newLedgerModel()
	for _, b := range buckets {
		known(t, store, b, limit, window)
		// The probe that put the bucket past discovery is a settled call like
		// any other, and it cost two tokens.
		model.settled[b] += 2
	}

	// A randomised sequence is only worth as much as the operations it actually
	// reaches. A case guarded into never firing, or a boundary that shadows the
	// one below it, leaves a passing test covering less than it claims - both
	// happened while this was written, so the counts are asserted rather than
	// assumed.
	seen := map[string]int{}
	rng := rand.New(rand.NewPCG(uint64(seed), 0))
	var outstanding []esiclient.Reservation
	// Which bucket each live hold is charged against, so the model can total one
	// bucket at a time.
	at := make(map[string]esiclient.Bucket)

	for step := range steps {
		// An expiry needs an empty bucket, so the sequence drains to one now and
		// then rather than reserving forever.
		draining := step%37 > 30

		switch pick := rng.IntN(100); {
		case len(outstanding) == 0 && draining:
			expirePast(t, be, window)
			model.expire()
			seen["expire"]++

		case (pick < 45 && !draining) || len(outstanding) == 0:
			b := buckets[rng.IntN(len(buckets))]
			grant, err := store.Reserve(t.Context(), b, esiclient.ClassBackground, marketPolicy, 1)
			if err != nil {
				t.Fatalf("step %d Reserve: %v", step, err)
			}
			// A refusal charges nothing, so the model has nothing to record.
			for _, r := range grant.Reservations {
				model.reserve(r)
				at[r.ID] = r.Bucket
				outstanding = append(outstanding, r)
			}

		case pick < 68:
			r := take(rng, &outstanding)
			cost := 1 + rng.IntN(3)
			if err := store.Settle(t.Context(), r, esiclient.Outcome{
				Attempted: true, Status: 200, Cost: cost, ObservedAt: time.Now(),
				Limit: limit, Window: window, Remaining: -1, Metered: true,
			}); err != nil {
				t.Fatalf("step %d Settle: %v", step, err)
			}
			model.settle(r, cost)
			delete(at, r.ID)
			seen["settle"]++

		case pick < 84:
			r := take(rng, &outstanding)
			if err := store.Release(t.Context(), r); err != nil {
				t.Fatalf("step %d Release: %v", step, err)
			}
			model.settle(r, 0)
			delete(at, r.ID)
			seen["release"]++

		default:
			// The response named a different rate-limit group than the one the
			// call was reserved against. Dispatcher.Settle handles it by giving
			// the hold back to the guessed bucket and settling onto the real
			// one, so it is driven here the same way: the reservation that goes
			// on to settle is whatever the dispatcher would have carried.
			r := take(rng, &outstanding)
			other := guessed
			if r.Bucket == guessed {
				other = disclosed
			}
			if err := store.Release(t.Context(), r); err != nil {
				t.Fatalf("step %d Release before move: %v", step, err)
			}
			moved := esiclient.RepointForTest(r, other)

			cost := 1 + rng.IntN(3)
			if err := store.Settle(t.Context(), moved, esiclient.Outcome{
				Attempted: true, Status: 200, Cost: cost, ObservedAt: time.Now(),
				Limit: limit, Window: window, Remaining: -1, Metered: true,
			}); err != nil {
				t.Fatalf("step %d Settle after move: %v", step, err)
			}
			model.move(r, other, cost)
			delete(at, r.ID)
			seen["move"]++
		}

		for _, b := range buckets {
			if got, want := ledgerTotal(t, be, b), model.total(b, at); got != want {
				t.Fatalf("step %d: %s ledger holds %d tokens, model says %d (seed %d)",
					step, b.Group, got, want, seed)
			}
		}
	}
	for _, op := range []string{"settle", "release", "move", "expire"} {
		if seen[op] == 0 {
			t.Errorf("no %s in %d steps, so the sequence never exercised it (seed %d)", op, steps, seed)
		}
	}
}

// take removes a random reservation and returns it, so a sequence settles holds
// in an order the caller never chose.
func take(rng *rand.Rand, from *[]esiclient.Reservation) esiclient.Reservation {
	i := rng.IntN(len(*from))
	r := (*from)[i]
	*from = append((*from)[:i], (*from)[i+1:]...)
	return r
}

// expirePast puts every charge made so far beyond its life. A charge outlives
// its window by up to one slot, so waiting the window alone is not enough.
//
// The fake skips the time; a real server has to be waited out, which is why the
// live run uses a window short enough to make that cheap.
func expirePast(t *testing.T, be backend, window time.Duration) {
	t.Helper()
	past := window + max(window/esiclient.SlotsPerWindow, time.Second) + 500*time.Millisecond
	if be.live() {
		time.Sleep(past)
		return
	}
	be.FastForward(t, past)
}
