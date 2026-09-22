package marketsources

import (
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/natsfake"
	"eve-industry-planner/testing/redisfake"

	"github.com/nats-io/nats.go/jetstream"
)

// Rens and Jita: one market an account saves, and one already priced.
const (
	rensStation = int64(60004588)
	rensRegion  = int64(10000030)
	jitaStation = int64(60003760)
	jitaRegion  = int64(10000002)
)

func registrar(t *testing.T) (*eipredis.Redis, *eipnats.NATS, jetstream.Stream) {
	t.Helper()

	nats := natsfake.New(t)
	stream, err := nats.NATS.Tasks.Ensure(t.Context())
	if err != nil {
		t.Fatalf("ensure task stream: %v", err)
	}
	return eipredis.NewRedis(redisfake.New(t).Client), nats.NATS, stream
}

func published(t *testing.T, stream jetstream.Stream) int {
	t.Helper()

	info, err := stream.Info(t.Context())
	if err != nil {
		t.Fatalf("stream info: %v", err)
	}
	return int(info.State.Msgs)
}

func market(stationID int64) models.MarketLocation {
	return models.MarketLocation{ID: "mkt", Name: "A market", StationID: stationID}
}

// Most sign-ins and most settings saves change no market at all, so the common
// case must cost one read and ask for nothing.
func TestAnAccountWhoseMarketsAreAllPricedAsksForNothing(t *testing.T) {
	redis, nats, stream := registrar(t)
	if err := redis.MarketOrders().TrackStation(t.Context(), rensRegion, rensStation, time.Now()); err != nil {
		t.Fatalf("track station: %v", err)
	}

	Register(t.Context(), redis, nats, models.MarketLocations{market(rensStation)})

	if count := published(t, stream); count != 0 {
		t.Errorf("published %d tasks for an account whose markets are all priced", count)
	}
}

// Only what is missing is asked for: an account that saves a second market must
// not have its first one registered again.
func TestOnlyTheMarketsThatAreNotPricedAreAskedFor(t *testing.T) {
	redis, nats, stream := registrar(t)
	if err := redis.MarketOrders().TrackStation(t.Context(), jitaRegion, jitaStation, time.Now()); err != nil {
		t.Fatalf("track station: %v", err)
	}

	Register(t.Context(), redis, nats,
		models.MarketLocations{market(jitaStation), market(rensStation)})

	if count := published(t, stream); count != 1 {
		t.Fatalf("published %d tasks, want one", count)
	}

	msg, err := stream.GetMsg(t.Context(), 1)
	if err != nil {
		t.Fatalf("read the published task: %v", err)
	}
	if want := eipnats.TrackMarketSources.Subject; msg.Subject != want {
		t.Fatalf("published to %s, want %s", msg.Subject, want)
	}
	// The market already priced must not be in it, or every sign-in would
	// re-register everything the account holds.
	if body := string(msg.Data); !strings.Contains(body, "60004588") || strings.Contains(body, "60003760") {
		t.Errorf("asked for %s, want only the market that is not priced", body)
	}
}

// An account with no saved market reads nothing and asks for nothing.
func TestAnAccountWithNoMarketsAsksForNothing(t *testing.T) {
	redis, nats, stream := registrar(t)

	Register(t.Context(), redis, nats, models.MarketLocations{})

	if count := published(t, stream); count != 0 {
		t.Errorf("published %d tasks for an account with no markets", count)
	}
}

// A citadel's orders are read with a character's token and cannot be walked
// centrally, so the server is never asked to price one — an account whose only
// market is a citadel asks for exactly as much as an account with none.
func TestACitadelIsNotSomethingTheServerIsAskedToPrice(t *testing.T) {
	redis, nats, stream := registrar(t)

	Register(t.Context(), redis, nats, models.MarketLocations{
		{ID: "mkt", Name: "A citadel", StructureID: 1035466617946, RegionID: 10000030},
	})

	if count := published(t, stream); count != 0 {
		t.Errorf("published %d tasks for an account whose only market is a citadel", count)
	}
}
