package documentschema

import (
	"reflect"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
)

func TestJobUpgradeStampsUnversionedAsCurrent(t *testing.T) {
	t.Parallel()
	job := &models.Job{JobID: "job-1"}

	(Upgrader{}).Job(job)
	if job.SchemaVersion != models.JobSchemaCurrent {
		t.Fatalf("schemaVersion = %d, want %d", job.SchemaVersion, models.JobSchemaCurrent)
	}
}

// Protecting identity is jobidentity's concern, not the schema's: upgrading a job
// must never convert, clear, or otherwise touch its identity fields.
func TestJobUpgradeLeavesIdentityAlone(t *testing.T) {
	t.Parallel()
	job := &models.Job{JobID: "job-1"}
	job.Build.Costs.LinkedJobs = []models.LinkedESIJob{
		{JobID: 512345678, CorporationID: 98765432},
	}

	(Upgrader{}).Job(job)
	if job.Protected != nil {
		t.Fatal("the schema upgrade must not touch field protection")
	}
	if job.Build.Costs.LinkedJobs[0].CorporationID != 98765432 {
		t.Fatal("the schema upgrade must not strip identity")
	}
}

func TestJobUpgradeClampsFutureVersions(t *testing.T) {
	t.Parallel()
	job := &models.Job{JobID: "job-future", SchemaVersion: 99}

	(Upgrader{}).Job(job)
	if job.SchemaVersion != models.JobSchemaCurrent {
		t.Fatalf("schemaVersion = %d, want %d", job.SchemaVersion, models.JobSchemaCurrent)
	}
}

// The pure upgrades must stay usable from the zero value, so callers that never
// touch jobs do not have to build an Upgrader.
func TestPureUpgradesWorkFromTheZeroValue(t *testing.T) {
	t.Parallel()
	var upgrader Upgrader

	user := &models.UserAccountDocument{}
	upgrader.UserAccountDocument(user)
	if user.SchemaVersion != models.UserAccountDocumentSchemaCurrent {
		t.Fatalf("user schemaVersion = %d", user.SchemaVersion)
	}

	group := &models.Group{}
	upgrader.Group(group)
	if group.SchemaVersion != models.GroupSchemaCurrent {
		t.Fatalf("group schemaVersion = %d", group.SchemaVersion)
	}

	settings := &models.ApplicationSettings{}
	upgrader.ApplicationSettings(settings, "acct", testTime())
	if settings.SchemaVersion != models.ApplicationSettingsSchemaCurrent {
		t.Fatalf("settings schemaVersion = %d", settings.SchemaVersion)
	}
}

func TestUpgradesTolerateNilDocuments(t *testing.T) {
	t.Parallel()
	var upgrader Upgrader
	upgrader.UserAccountDocument(nil)
	upgrader.Group(nil)
	upgrader.ApplicationSettings(nil, "acct", testTime())
	upgrader.Job(nil)
	upgrader.ArchivedJobStats(nil)
}

func TestArchivedJobStatsClampsFutureVersions(t *testing.T) {
	t.Parallel()

	row := &models.ArchivedJobStats{Owner: models.AccountOwner("acct-1"), SchemaVersion: 99}
	Upgrader{}.ArchivedJobStats(row)

	if row.SchemaVersion != models.ArchivedJobStatsSchemaCurrent {
		t.Fatalf("schemaVersion = %d, want it clamped", row.SchemaVersion)
	}
}

func testTime() time.Time {
	return time.Date(2026, 8, 21, 0, 0, 0, 0, time.UTC)
}

// A row already at the current version keeps the labels it holds.
func TestArchivedJobStatsUpgradeKeepsLabelsItAlreadyHas(t *testing.T) {
	t.Parallel()

	row := &models.ArchivedJobStats{
		Owner:           models.AccountOwner("acct-1"),
		SchemaVersion:   models.ArchivedJobStatsSchemaCurrent,
		ExtraCategories: []models.ArchivedExtraCategory{{ID: "90", Label: "Retired Courier Contract", Amount: 5}},
	}
	Upgrader{}.ArchivedJobStats(row)

	if row.ExtraCategories[0].Label != "Retired Courier Contract" {
		t.Fatalf("label = %q, want the name the row was archived under", row.ExtraCategories[0].Label)
	}
}

// A document stored before DefaultPricing existed decodes to empty sides, and Go
// serialises them whether or not Mongo held them — so a caller downstream cannot
// tell "unset" from "chosen" unless the upgrader fills them first.
func TestApplicationSettingsSeedsPricingFromTheSingleDefault(t *testing.T) {
	doc := &models.ApplicationSettings{
		DefaultMarketLocation: "amarr",
		DefaultOrderType:      "buy",
	}

	var u Upgrader
	u.ApplicationSettings(doc, "acct-1", time.Now().UTC())

	want := models.PricingSide{Market: "amarr", Basis: "buy"}
	if !reflect.DeepEqual(doc.DefaultPricing.Buying, want) {
		t.Fatalf("buying = %+v, want %+v", doc.DefaultPricing.Buying, want)
	}
	// The selling side takes the market and no basis — its route answers that —
	// and the route is read from the single default it was being priced on.
	want = models.PricingSide{Market: "amarr", Exit: models.ExitRouteImmediate}
	if !reflect.DeepEqual(doc.DefaultPricing.Selling, want) {
		t.Fatalf("selling = %+v, want %+v", doc.DefaultPricing.Selling, want)
	}
}

// An account priced from the ask was being shown a listing, which is the route
// it keeps; one priced from bids was reading a listing's fee against a bid's
// price, and the seed is what ends that.
func TestApplicationSettingsReadsTheExitRouteFromTheStoredBasis(t *testing.T) {
	for basis, want := range map[string]string{
		"sell":    models.ExitRouteListed,
		"sellP05": models.ExitRouteListed,
		"buy":     models.ExitRouteImmediate,
		"buyP95":  models.ExitRouteImmediate,
	} {
		doc := &models.ApplicationSettings{
			DefaultPricing: models.PricingDefaults{
				Selling: models.PricingSide{Market: "jita", Basis: basis},
			},
		}

		var u Upgrader
		u.ApplicationSettings(doc, "acct-1", time.Now().UTC())

		if got := doc.DefaultPricing.Selling.Exit; got != want {
			t.Fatalf("basis %q gave exit %q, want %q", basis, got, want)
		}
	}
}

func TestApplicationSettingsLeavesAChosenPricingSideAlone(t *testing.T) {
	chosen := models.PricingSide{Market: "hek", Basis: "buyP95"}
	doc := &models.ApplicationSettings{
		DefaultMarketLocation: "amarr",
		DefaultOrderType:      "buy",
		DefaultPricing:        models.PricingDefaults{Selling: chosen},
	}

	var u Upgrader
	u.ApplicationSettings(doc, "acct-1", time.Now().UTC())

	// The market and basis it chose are untouched; the route is filled because it
	// had none, and follows the basis it was already priced on.
	chosen.Exit = models.ExitRouteImmediate
	if !reflect.DeepEqual(doc.DefaultPricing.Selling, chosen) {
		t.Fatalf("selling = %+v, want %+v", doc.DefaultPricing.Selling, chosen)
	}
	want := models.PricingSide{Market: "amarr", Basis: "buy"}
	if !reflect.DeepEqual(doc.DefaultPricing.Buying, want) {
		t.Fatalf("buying = %+v, want %+v", doc.DefaultPricing.Buying, want)
	}
}

// Every upgrade step must be safe to run twice; this one is gated on an empty
// market rather than a version, so it has to be checked directly.
func TestApplicationSettingsPricingSeedIsIdempotent(t *testing.T) {
	doc := &models.ApplicationSettings{DefaultMarketLocation: "dodixie", DefaultOrderType: "sellP05"}

	var u Upgrader
	u.ApplicationSettings(doc, "acct-1", time.Now().UTC())
	first := doc.DefaultPricing
	u.ApplicationSettings(doc, "acct-1", time.Now().UTC())

	if !reflect.DeepEqual(doc.DefaultPricing, first) {
		t.Fatalf("second run changed pricing: %+v then %+v", first, doc.DefaultPricing)
	}
}

// An account with neither field set still gets a usable pair.
func TestApplicationSettingsPricingFallsBackToTheGlobalDefault(t *testing.T) {
	doc := &models.ApplicationSettings{}

	var u Upgrader
	u.ApplicationSettings(doc, "acct-1", time.Now().UTC())

	if want := models.DefaultPricingDefaults(); !reflect.DeepEqual(doc.DefaultPricing, want) {
		t.Fatalf("pricing = %+v, want %+v", doc.DefaultPricing, want)
	}
}

// A side can carry market group defaults before it names a market of its own, so
// the seed fills the two fields rather than replacing the side.
func TestApplicationSettingsSeedKeepsAGroupTable(t *testing.T) {
	groups := map[string]models.PricingChoice{"1857": {Market: "hek"}}
	doc := &models.ApplicationSettings{
		DefaultMarketLocation: "amarr",
		DefaultOrderType:      "buy",
		DefaultPricing: models.PricingDefaults{
			Buying: models.PricingSide{Groups: groups},
		},
	}

	var u Upgrader
	u.ApplicationSettings(doc, "acct-1", time.Now().UTC())

	if !reflect.DeepEqual(doc.DefaultPricing.Buying.Groups, groups) {
		t.Fatalf("groups = %+v, want %+v", doc.DefaultPricing.Buying.Groups, groups)
	}
	if doc.DefaultPricing.Buying.Market != "amarr" {
		t.Fatalf("market = %q, want amarr", doc.DefaultPricing.Buying.Market)
	}
}

// The seed runs on every read rather than in an offline drain, so a route the
// player has chosen has to survive it — including when the legacy single default
// still says something different, which it does until Stage A step 7 lands.
func TestApplicationSettingsKeepsAChosenExitRoute(t *testing.T) {
	doc := &models.ApplicationSettings{
		DefaultMarketLocation: "jita",
		DefaultOrderType:      "sell",
		DefaultPricing: models.PricingDefaults{
			Selling: models.PricingSide{Market: "jita", Exit: models.ExitRouteImmediate},
		},
	}

	var u Upgrader
	u.ApplicationSettings(doc, "acct-1", time.Now().UTC())
	u.ApplicationSettings(doc, "acct-1", time.Now().UTC())

	if got := doc.DefaultPricing.Selling.Exit; got != models.ExitRouteImmediate {
		t.Fatalf("exit = %q, want the route the account chose", got)
	}
}
