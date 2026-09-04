package esi

import (
	"slices"
	"testing"
	"time"

	esicore "eve-industry-planner/shared/core/esi"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/testing/esifake"
	"eve-industry-planner/testing/redisfake"

	redislib "github.com/redis/go-redis/v9"
)

func TestRegionStillFreshFollowsTheRecordedMaxAge(t *testing.T) {
	fake := redisfake.New(t)
	const regionID = 10000002
	now := time.Now()

	// Nothing fetched yet, so there is no answer and the first pass must run.
	if fresh, _ := regionStillFresh(t.Context(), fake.Client, regionID, now); fresh {
		t.Error("an unfetched region reported fresh, so its first pass would never happen")
	}

	stale := now.Add(10 * time.Minute)
	if err := rediscore.SaveNextRefresh(t.Context(), fake.Client,
		rediscore.RegionMarketOrdersDataset(regionID), stale); err != nil {
		t.Fatalf("seeding freshness: %v", err)
	}
	fresh, at := regionStillFresh(t.Context(), fake.Client, regionID, now)
	if !fresh {
		t.Error("a region inside its max-age reported stale")
	}
	if !at.Equal(stale.UTC().Truncate(time.Millisecond)) && at.Sub(stale).Abs() > time.Millisecond {
		t.Errorf("reported stale at %s, want %s", at, stale)
	}

	if fresh, _ := regionStillFresh(t.Context(), fake.Client, regionID, stale.Add(time.Second)); fresh {
		t.Error("a region past its max-age still reported fresh")
	}
}

func TestRegionFreshnessIsPerRegion(t *testing.T) {
	// One region going fresh must not silence the rest of the rotation.
	fake := redisfake.New(t)
	now := time.Now()

	if err := rediscore.SaveNextRefresh(t.Context(), fake.Client,
		rediscore.RegionMarketOrdersDataset(10000002), now.Add(10*time.Minute)); err != nil {
		t.Fatalf("seeding freshness: %v", err)
	}

	if fresh, _ := regionStillFresh(t.Context(), fake.Client, 10000043, now); fresh {
		t.Error("one region's freshness was read as another's")
	}
}

func TestAffordabilityCostsTheRegionsMeasuredPageCount(t *testing.T) {
	fake := redisfake.New(t)
	esi := esifake.New(t)
	const regionID = 10000002

	// A region nothing has walked has no page count, and the first pass is what
	// establishes one — so it is published rather than blocked.
	if !canAffordRegionRefresh(t.Context(), esi, fake.Client, regionID) {
		t.Error("an unwalked region was blocked, so its page count could never be learned")
	}
	if len(esi.HeadroomQueries()) != 0 {
		t.Error("the budget was queried with no page count to cost")
	}

	// Three pages last pass, so the run costs three successes.
	etags := map[int]string{1: `"a"`, 2: `"b"`, 3: `"c"`}
	if err := rediscore.SaveRegionMarketOrdersETags(t.Context(), fake.Client, regionID, etags); err != nil {
		t.Fatalf("seeding etags: %v", err)
	}

	esi.SetHeadroom(esiclient.ClassBackground, esiclient.Headroom{Known: true, Available: 3 * esiclient.SuccessCost})
	if !canAffordRegionRefresh(t.Context(), esi, fake.Client, regionID) {
		t.Errorf("a budget of exactly %d refused a %d-token run", 3*esiclient.SuccessCost, 3*esiclient.SuccessCost)
	}

	esi.SetHeadroom(esiclient.ClassBackground, esiclient.Headroom{Known: true, Available: 3*esiclient.SuccessCost - 1})
	if canAffordRegionRefresh(t.Context(), esi, fake.Client, regionID) {
		t.Error("a budget one token short admitted the run")
	}
}

func TestAffordabilityAsksAboutTheRegionBeingPublished(t *testing.T) {
	// The group is learned per exact path, so asking about a stand-in region
	// would consult a bucket the work is not going to spend from.
	fake := redisfake.New(t)
	esi := esifake.New(t)
	const regionID = 10000043

	if err := rediscore.SaveRegionMarketOrdersETags(t.Context(), fake.Client, regionID,
		map[int]string{1: `"a"`}); err != nil {
		t.Fatalf("seeding etags: %v", err)
	}
	esi.SetHeadroom(esiclient.ClassBackground, esiclient.Headroom{Known: true, Available: 1000})

	canAffordRegionRefresh(t.Context(), esi, fake.Client, regionID)

	asked := esi.HeadroomQueries()
	if len(asked) != 1 {
		t.Fatalf("made %d headroom queries, want 1", len(asked))
	}
	if want := "/markets/10000043/orders/"; asked[0].Path != want {
		t.Errorf("asked about %q, want %q", asked[0].Path, want)
	}
	if asked[0].Class != esiclient.ClassBackground {
		t.Errorf("asked as %s, want background", asked[0].Class)
	}
}

func TestAffordabilityPublishesWhenTheBudgetCannotBeRead(t *testing.T) {
	// A refresh that cannot be costed is still worth attempting: the limiter
	// refuses it if there is really no room.
	fake := redisfake.New(t)
	if !canAffordRegionRefresh(t.Context(), nil, fake.Client, 10000002) {
		t.Error("no ESI client blocked the run instead of letting the limiter decide")
	}
}

func TestAKnownPageCountWithAnUnknownAllowanceStillPublishes(t *testing.T) {
	// The state a deploy lands in: page counts survive from previous runs, but
	// no response has yet told the new limiter what the bucket allows. Refusing
	// here would stop region refreshes permanently, because the only thing that
	// discloses the allowance is the call being refused.
	fake := redisfake.New(t)
	esi := esifake.New(t)
	const regionID = 10000043

	etags := make(map[int]string, 185)
	for page := 1; page <= 185; page++ {
		etags[page] = `"page"`
	}
	if err := rediscore.SaveRegionMarketOrdersETags(t.Context(), fake.Client, regionID, etags); err != nil {
		t.Fatalf("seeding etags: %v", err)
	}

	esi.SetHeadroom(esiclient.ClassBackground, esiclient.Headroom{Known: false, Available: 0})

	if !canAffordRegionRefresh(t.Context(), esi, fake.Client, regionID) {
		t.Fatal("a 185-page region was blocked because the allowance was unknown; nothing would ever unblock it")
	}
}

// walked records a hub as having been paged at t, and its book as expired.
func walked(t *testing.T, client *redislib.Client, regionID int32, at time.Time) {
	t.Helper()
	if err := rediscore.SaveRegionMarketOrdersRefreshTime(t.Context(), client, regionID, at.UnixMilli()); err != nil {
		t.Fatalf("seeding refresh time: %v", err)
	}
	if err := rediscore.SaveNextRefresh(t.Context(), client,
		rediscore.RegionMarketOrdersDataset(regionID), at.Add(5*time.Minute)); err != nil {
		t.Fatalf("seeding freshness: %v", err)
	}
}

func regionIDs(locations []esicore.MarketLocation) []int32 {
	out := make([]int32, 0, len(locations))
	for _, l := range locations {
		out = append(out, l.RegionID)
	}
	return out
}

func TestAHubNeverWalkedIsDue(t *testing.T) {
	fake := redisfake.New(t)
	regions := esicore.DefaultMarketLocations

	due, err := regionsDue(t.Context(), fake.Client, regions, time.Now())
	if err != nil {
		t.Fatalf("regionsDue: %v", err)
	}
	if len(due) != len(regions) {
		t.Errorf("%d of %d hubs were due on a cold start, want all", len(due), len(regions))
	}
}

func TestAHubInsideTheSweepIntervalIsNotDue(t *testing.T) {
	fake := redisfake.New(t)
	now := time.Now()
	regions := esicore.DefaultMarketLocations

	for _, l := range regions {
		walked(t, fake.Client, l.RegionID, now.Add(-30*time.Minute))
	}

	due, err := regionsDue(t.Context(), fake.Client, regions, now)
	if err != nil {
		t.Fatalf("regionsDue: %v", err)
	}
	if len(due) != 0 {
		t.Errorf("%v were due half an interval after their last pass", regionIDs(due))
	}

	// Once the interval has passed they all are again.
	due, err = regionsDue(t.Context(), fake.Client, regions, now.Add(regionSweepInterval))
	if err != nil {
		t.Fatalf("regionsDue: %v", err)
	}
	if len(due) != len(regions) {
		t.Errorf("%d hubs were due a full interval on, want %d", len(due), len(regions))
	}
}

func TestStalestHubIsSweptFirst(t *testing.T) {
	// Under a budget too tight for every hub, the oldest book is the one worth
	// spending on.
	fake := redisfake.New(t)
	now := time.Now()
	regions := esicore.DefaultMarketLocations
	if len(regions) < 3 {
		t.Skip("needs at least three hubs to order")
	}

	walked(t, fake.Client, regions[0].RegionID, now.Add(-2*time.Hour))
	walked(t, fake.Client, regions[1].RegionID, now.Add(-9*time.Hour))
	walked(t, fake.Client, regions[2].RegionID, now.Add(-5*time.Hour))

	due, err := regionsDue(t.Context(), fake.Client, regions, now)
	if err != nil {
		t.Fatalf("regionsDue: %v", err)
	}
	if len(due) < 3 {
		t.Fatalf("only %d hubs were due, want at least 3", len(due))
	}

	// A hub never walked at all sorts ahead of every dated one.
	want := []int32{regions[1].RegionID, regions[2].RegionID, regions[0].RegionID}
	got := regionIDs(due)
	dated := got[len(got)-3:]
	if !slices.Equal(dated, want) {
		t.Errorf("swept dated hubs %v, want stalest first %v", dated, want)
	}
}

func TestAHubIsNotWalkedInsideItsMaxAge(t *testing.T) {
	// A call before ESI's cache expires is answered 304 and still costs a token,
	// so it buys nothing. This is what keeps a shorter sweep interval safe.
	fake := redisfake.New(t)
	now := time.Now()
	regions := esicore.DefaultMarketLocations[:1]
	regionID := regions[0].RegionID

	// Long past due by the sweep interval, but ESI says the book is current.
	if err := rediscore.SaveRegionMarketOrdersRefreshTime(t.Context(), fake.Client,
		regionID, now.Add(-4*time.Hour).UnixMilli()); err != nil {
		t.Fatalf("seeding refresh time: %v", err)
	}
	if err := rediscore.SaveNextRefresh(t.Context(), fake.Client,
		rediscore.RegionMarketOrdersDataset(regionID), now.Add(3*time.Minute)); err != nil {
		t.Fatalf("seeding freshness: %v", err)
	}

	due, err := regionsDue(t.Context(), fake.Client, regions, now)
	if err != nil {
		t.Fatalf("regionsDue: %v", err)
	}
	if len(due) != 0 {
		t.Errorf("%v was walked inside its max-age, which can only return 304", regionIDs(due))
	}
}

func TestSweepFreshnessDoesNotDependOnHubCount(t *testing.T) {
	// The defect the cursor had: how fresh a hub could be was decided by how
	// many hubs there were. Every hub must come due on the same interval
	// whatever the list length.
	fake := redisfake.New(t)
	now := time.Now()
	all := esicore.DefaultMarketLocations

	for _, l := range all {
		walked(t, fake.Client, l.RegionID, now.Add(-regionSweepInterval-time.Minute))
	}

	for _, count := range []int{1, 2, len(all)} {
		due, err := regionsDue(t.Context(), fake.Client, all[:count], now)
		if err != nil {
			t.Fatalf("regionsDue: %v", err)
		}
		if len(due) != count {
			t.Errorf("with %d hubs configured, %d came due; every one past the interval should", count, len(due))
		}
	}
}
