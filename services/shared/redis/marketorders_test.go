package redis

// The market-orders keyspace: what each key is called and how long it lives.
// Pinned to literals, for the same reason the dataset keys are.

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"eve-industry-planner/testing/redisfake"

	redislib "github.com/redis/go-redis/v9"
)

// testRegion is The Forge, and testStation Jita 4-4 inside it — the region the
// market-order tests walk and the station they price.
const (
	testRegion  int32 = 10000002
	testStation int64 = 60003760
)

func TestMarketOrdersRefreshTimeUpdatesInPlace(t *testing.T) {
	// A region refreshing again moves its score rather than adding a member.
	ctx := context.Background()
	fake := redisfake.New(t)
	store := handle(t, fake).MarketOrders()

	first := time.UnixMilli(1_700_000_000_000).UTC()
	second := time.UnixMilli(1_700_000_500_000).UTC()
	for _, at := range []time.Time{first, second} {
		if err := store.PutRefreshTime(ctx, testRegion, at); err != nil {
			t.Fatalf("put: %v", err)
		}
	}

	times, err := store.RefreshTimes(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(times) != 1 {
		t.Fatalf("got %d entries, want 1", len(times))
	}
	if !times[0].LastUpdated.Equal(second) {
		t.Fatalf("last updated = %v, want %v", times[0].LastUpdated, second)
	}
}

// Pinned to literals: the equivalence tests read the same constants they check,
// so only this can catch a constant itself being wrong.
func TestMarketOrdersKeyLifetimes(t *testing.T) {
	for name, tc := range map[string]struct {
		got  time.Duration
		want time.Duration
	}{
		"region price":         {ttlRegionPrice, 2 * time.Hour},
		"region etags":         {ttlRegionETags, 24 * time.Hour},
		"region refresh times": {ttlRegionRefreshTimes, 0},
		"tracked stations":     {ttlTrackedStations, 0},
	} {
		t.Run(name, func(t *testing.T) {
			if tc.got != tc.want {
				t.Errorf("ttl = %v, want %v", tc.got, tc.want)
			}
		})
	}
}

func TestRegionPriceLifetimeRetiresSoldOutTypesWithoutDroppingLiveOnes(t *testing.T) {
	const sweep = time.Hour

	// A sweep whose pages all 304 rewrites no prices today, so the lifetime has
	// to span more than one sweep.
	const unchangedSweepsToSurvive = 2

	if ttlRegionPrice < sweep*unchangedSweepsToSurvive {
		t.Errorf("ttl %v does not survive %d unchanged sweeps of %v; live prices would lapse",
			ttlRegionPrice, unchangedSweepsToSurvive, sweep)
	}

	if ttlRegionPrice > 6*time.Hour {
		t.Errorf("ttl %v keeps a sold-out type's price too long", ttlRegionPrice)
	}
}

func TestMarketOrdersWritesCarryTheirKeyKindsLifetime(t *testing.T) {
	ctx := context.Background()
	fake := redisfake.New(t)
	store := handle(t, fake).MarketOrders()

	if err := store.PutPrice(ctx, 34, testStation, MarketPriceEntry{Buy: 1}); err != nil {
		t.Fatalf("put price: %v", err)
	}
	if err := store.PutETags(ctx, testRegion, map[int]string{1: "a"}); err != nil {
		t.Fatalf("put etags: %v", err)
	}
	if err := store.PutRefreshTime(ctx, testRegion, time.UnixMilli(1_700_000_000_000)); err != nil {
		t.Fatalf("put refresh time: %v", err)
	}

	if err := store.TrackStation(ctx, testRegion, testStation, time.UnixMilli(1_700_000_000_000)); err != nil {
		t.Fatalf("track station: %v", err)
	}

	for key, want := range map[string]time.Duration{
		priceKey(34, testStation):      ttlRegionPrice,
		regionETagsKey(testRegion):     ttlRegionETags,
		regionRefreshTimesKey:          0,
		trackedStationsKey(testRegion): 0,
	} {
		if got := fake.Server.TTL(key); got != want {
			t.Errorf("key %q: ttl = %v, want %v", key, got, want)
		}
	}
}

// A station is tracked by being asked for, and asking again moves its timestamp
// rather than adding a second member — the set is what a derive pass reads, and
// a station listed twice would be priced twice.
func TestTrackingAStationAgainMovesItsTimestamp(t *testing.T) {
	ctx := context.Background()
	store := handle(t, redisfake.New(t)).MarketOrders()

	first := time.UnixMilli(1_700_000_000_000)
	later := first.Add(2 * time.Hour)
	for _, at := range []time.Time{first, later} {
		if err := store.TrackStation(ctx, testRegion, testStation, at); err != nil {
			t.Fatalf("track station: %v", err)
		}
	}

	tracked, err := store.TrackedStations(ctx, testRegion)
	if err != nil {
		t.Fatalf("tracked stations: %v", err)
	}
	if len(tracked) != 1 {
		t.Fatalf("tracked %d stations, want 1: %+v", len(tracked), tracked)
	}
	if !tracked[0].LastAsked.Equal(later.UTC()) {
		t.Errorf("last asked = %v, want the later ask %v", tracked[0].LastAsked, later.UTC())
	}
}

// A market nobody has asked about in a while stops being swept; one still being
// asked about keeps its place, and the count of those is what tells a caller
// whether the region is worth walking at all.
func TestDroppingStationsKeepsTheOnesStillAskedFor(t *testing.T) {
	ctx := context.Background()
	store := handle(t, redisfake.New(t)).MarketOrders()

	const abandoned int64 = 60005686
	cutoff := time.UnixMilli(1_700_000_000_000)

	if err := store.TrackStation(ctx, testRegion, abandoned, cutoff.Add(-time.Hour)); err != nil {
		t.Fatalf("track the abandoned station: %v", err)
	}
	if err := store.TrackStation(ctx, testRegion, testStation, cutoff.Add(time.Hour)); err != nil {
		t.Fatalf("track the wanted station: %v", err)
	}

	remaining, err := store.DropStationsAskedBefore(ctx, testRegion, cutoff)
	if err != nil {
		t.Fatalf("drop stations: %v", err)
	}
	if remaining != 1 {
		t.Fatalf("remaining = %d, want 1", remaining)
	}

	tracked, err := store.TrackedStations(ctx, testRegion)
	if err != nil {
		t.Fatalf("tracked stations: %v", err)
	}
	if len(tracked) != 1 || tracked[0].StationID != testStation {
		t.Fatalf("tracked %+v, want only station %d", tracked, testStation)
	}
}

// Forgetting a region takes both the stations wanted in it and its place in the
// sweep: leaving the refresh time behind would keep walking a book for nobody.
//
// And a region something still wants is kept, because that is what stops a
// market registered while a retirement pass was deciding from being wiped.
func TestForgettingARegionLeavesNothingBehind(t *testing.T) {
	ctx := context.Background()
	store := handle(t, redisfake.New(t)).MarketOrders()

	if err := store.TrackStation(ctx, testRegion, testStation, time.UnixMilli(1_700_000_000_000)); err != nil {
		t.Fatalf("track station: %v", err)
	}
	if err := store.PutRefreshTime(ctx, testRegion, time.UnixMilli(1_700_000_000_000)); err != nil {
		t.Fatalf("put refresh time: %v", err)
	}

	if stopped, err := store.StopTrackingRegionIfUnwanted(ctx, testRegion); err != nil {
		t.Fatalf("stop tracking: %v", err)
	} else if stopped {
		t.Fatal("a region with a station still tracked in it was forgotten")
	}

	if _, err := store.DropStationsAskedBefore(ctx, testRegion, time.UnixMilli(1_800_000_000_000)); err != nil {
		t.Fatalf("drop stations: %v", err)
	}

	stopped, err := store.StopTrackingRegionIfUnwanted(ctx, testRegion)
	if err != nil {
		t.Fatalf("stop tracking: %v", err)
	}
	if !stopped {
		t.Fatal("a region nothing wants was kept")
	}

	tracked, err := store.TrackedStations(ctx, testRegion)
	if err != nil {
		t.Fatalf("tracked stations: %v", err)
	}
	if len(tracked) != 0 {
		t.Errorf("tracked %+v, want none", tracked)
	}

	times, err := store.RefreshTimes(ctx)
	if err != nil {
		t.Fatalf("refresh times: %v", err)
	}
	for _, time := range times {
		if time.RegionID == testRegion {
			t.Errorf("region %d is still swept after being forgotten", testRegion)
		}
	}
}

// A registration landing after the emptiness check and before the delete is the
// race this exists for: the transaction aborts, the region keeps its place, and
// the station that was just asked for survives.
//
// Forced rather than waited for — a hook fires the competing write the moment
// the watched key is read, which is the one ordering that reopens the bug.
func TestARegistrationDuringTheDeleteKeepsTheRegion(t *testing.T) {
	ctx := context.Background()
	fake := redisfake.New(t)

	competitor := redislib.NewClient(&redislib.Options{Addr: fake.Addr()})
	t.Cleanup(func() { _ = competitor.Close() })

	raced := false
	fake.Client.AddHook(watchedKeyHook{
		// Whichever read decides the set is empty, the competing write lands straight after it.
		on: []string{"zcard", "zrange", "zrangebyscore"},
		fire: func() {
			if raced {
				return
			}
			raced = true
			if err := NewRedis(competitor).MarketOrders().TrackStation(ctx, testRegion, testStation, time.Now()); err != nil {
				t.Errorf("the competing registration failed: %v", err)
			}
		},
	})

	store := handle(t, fake).MarketOrders()
	stopped, err := store.StopTrackingRegionIfUnwanted(ctx, testRegion)
	if err != nil {
		t.Fatalf("stop tracking: %v", err)
	}
	if !raced {
		t.Fatal("the competing registration never fired, so nothing was raced")
	}
	if stopped {
		t.Fatal("a region registered again mid-delete was forgotten anyway")
	}

	tracked, err := store.TrackedStations(ctx, testRegion)
	if err != nil {
		t.Fatalf("tracked stations: %v", err)
	}
	if len(tracked) != 1 || tracked[0].StationID != testStation {
		t.Errorf("tracked %+v, want the station registered mid-delete", tracked)
	}
}

// watchedKeyHook runs fire after the named command is processed, which is how a
// test puts a competing write exactly where the race is.
type watchedKeyHook struct {
	on   []string
	fire func()
}

func (h watchedKeyHook) DialHook(next redislib.DialHook) redislib.DialHook { return next }

func (h watchedKeyHook) ProcessHook(next redislib.ProcessHook) redislib.ProcessHook {
	return func(ctx context.Context, cmd redislib.Cmder) error {
		err := next(ctx, cmd)
		if slices.Contains(h.on, cmd.Name()) {
			h.fire()
		}
		return err
	}
}

func (h watchedKeyHook) ProcessPipelineHook(next redislib.ProcessPipelineHook) redislib.ProcessPipelineHook {
	return next
}

// The index is what a caller reads to decide a market needs nothing done, so it
// is written only once the rest of the tracking has landed. A failure part way
// through must leave a market looking unregistered — asked for again — rather
// than tracked with a region nothing sweeps.
func TestTheIndexIsNotWrittenUntilTheRestOfTheTrackingIs(t *testing.T) {
	ctx := context.Background()
	fake := redisfake.New(t)

	fake.Client.AddHook(failingCommandHook{
		on: func(cmd redislib.Cmder) bool {
			args := cmd.Args()
			return cmd.Name() == "zadd" && len(args) > 1 && args[1] == trackedRegionsKey
		},
	})

	store := handle(t, fake).MarketOrders()
	if err := store.TrackStation(ctx, testRegion, testStation, time.Now()); err == nil {
		t.Fatal("tracking reported success though a write failed")
	}

	regions, err := store.RegionsOfTrackedStations(ctx, []int64{testStation})
	if err != nil {
		t.Fatalf("read the index: %v", err)
	}
	if _, indexed := regions[testStation]; indexed {
		t.Error("the index claims a market is tracked though tracking did not finish")
	}
}

// failingCommandHook fails the commands a test picks out, for the partial
// failure that write order exists to survive.
type failingCommandHook struct {
	on func(redislib.Cmder) bool
}

func (h failingCommandHook) DialHook(next redislib.DialHook) redislib.DialHook { return next }

func (h failingCommandHook) ProcessHook(next redislib.ProcessHook) redislib.ProcessHook {
	return func(ctx context.Context, cmd redislib.Cmder) error {
		if h.on(cmd) {
			err := errors.New("redis: injected failure")
			cmd.SetErr(err)
			return err
		}
		return next(ctx, cmd)
	}
}

func (h failingCommandHook) ProcessPipelineHook(next redislib.ProcessPipelineHook) redislib.ProcessPipelineHook {
	return next
}
