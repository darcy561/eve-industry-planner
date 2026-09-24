package documentschema

import (
	"reflect"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
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
	job.ESI.LinkedJobs = map[string]models.LinkedESIJob{
		"512345678": {JobID: 512345678, CorporationID: 98765432},
	}

	(Upgrader{}).Job(job)
	if job.Protected != nil {
		t.Fatal("the schema upgrade must not touch field protection")
	}
	if job.ESI.LinkedJobs["512345678"].CorporationID != 98765432 {
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

// An account priced from the ask was being shown a listing, which is the route
// it keeps; one priced from bids was reading a listing's fee against a bid's
// price, and the seed is what ends that.
func TestApplicationSettingsReadsTheExitRouteFromTheStoredOrderType(t *testing.T) {
	for orderType, want := range map[string]string{
		"sell":    models.ExitRouteListed,
		"sellP05": models.ExitRouteListed,
		"buy":     models.ExitRouteImmediate,
		"buyP95":  models.ExitRouteImmediate,
	} {
		doc := &models.ApplicationSettings{
			DefaultPricing: models.PricingDefaults{
				Selling: models.PricingSide{Market: "jita", OrderType: orderType},
			},
		}

		var u Upgrader
		u.ApplicationSettings(doc, "acct-1", time.Now().UTC())

		if got := doc.DefaultPricing.Selling.Exit; got != want {
			t.Fatalf("orderType %q gave exit %q, want %q", orderType, got, want)
		}
	}
}

func TestApplicationSettingsLeavesAChosenPricingSideAlone(t *testing.T) {
	chosen := models.PricingSide{Market: "hek", OrderType: "buyP95"}
	doc := &models.ApplicationSettings{
		DefaultPricing: models.PricingDefaults{Selling: chosen},
	}

	var u Upgrader
	u.ApplicationSettings(doc, "acct-1", time.Now().UTC())

	// The market and order type it chose are untouched; the route is filled because it
	// had none, and follows the order type it was already priced on.
	chosen.Exit = models.ExitRouteImmediate
	if !reflect.DeepEqual(doc.DefaultPricing.Selling, chosen) {
		t.Fatalf("selling = %+v, want %+v", doc.DefaultPricing.Selling, chosen)
	}
	// The side it said nothing about takes the defaults, and does not follow the
	// side it did choose.
	if want := models.DefaultPricingDefaults().Buying; !reflect.DeepEqual(doc.DefaultPricing.Buying, want) {
		t.Fatalf("buying = %+v, want %+v", doc.DefaultPricing.Buying, want)
	}
}

// Every upgrade step must be safe to run twice; this one is gated on an empty
// market rather than a version, so it has to be checked directly.
func TestApplicationSettingsPricingSeedIsIdempotent(t *testing.T) {
	doc := &models.ApplicationSettings{
		DefaultPricing: models.PricingDefaults{
			Selling: models.PricingSide{Market: "dodixie", OrderType: "sellP05"},
		},
	}

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
	groups := map[string]models.GroupPricing{"1857": {Market: "hek"}}
	doc := &models.ApplicationSettings{
		DefaultPricing: models.PricingDefaults{
			Buying: models.PricingSide{Groups: groups},
		},
	}

	var u Upgrader
	u.ApplicationSettings(doc, "acct-1", time.Now().UTC())

	if !reflect.DeepEqual(doc.DefaultPricing.Buying.Groups, groups) {
		t.Fatalf("groups = %+v, want %+v", doc.DefaultPricing.Buying.Groups, groups)
	}
	if want := models.DefaultPricingDefaults().Buying.Market; doc.DefaultPricing.Buying.Market != want {
		t.Fatalf("market = %q, want %q", doc.DefaultPricing.Buying.Market, want)
	}
}

// The seed runs on every read rather than in an offline drain, so a route the
// player has chosen has to survive it, however many times it runs.
func TestApplicationSettingsKeepsAChosenExitRoute(t *testing.T) {
	doc := &models.ApplicationSettings{
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

// A market row is lifted onto its own lane as the document is read, whatever
// version the document claims — an unversioned one is stamped current before any
// step runs, so a step that gated on the version would never fire for the rows
// most needing it.
func TestASettingsDocumentsMarketsMoveToTheirOwnLane(t *testing.T) {
	doc := models.ApplicationSettings{
		CustomStructures: models.CustomStructures{
			{ID: "sotiyo", Name: "Sotiyo", JobType: 1},
			{ID: "azbel", Name: "Azbel", JobType: models.StructureKindMarket, StructureID: 1035466617946},
		},
	}

	Upgrader{}.ApplicationSettings(&doc, "account-1", time.Now().UTC())

	if len(doc.MarketLocations) != 1 || doc.MarketLocations[0].ID != "azbel" {
		t.Errorf("markets = %+v, want the saved market on its own lane", doc.MarketLocations)
	}
	if len(doc.CustomStructures) != 1 || doc.CustomStructures[0].ID != "sotiyo" {
		t.Errorf("structures = %+v, want only the place a job runs in", doc.CustomStructures)
	}
}

func TestAPlannersMarketsMoveToTheirOwnLane(t *testing.T) {
	doc := planner.Settings{
		CustomStructures: models.CustomStructures{
			{ID: "azbel", Name: "Azbel", JobType: models.StructureKindMarket, StructureID: 1035466617946},
		},
	}

	Upgrader{}.PlannerSettings(&doc)

	if len(doc.MarketLocations) != 1 || len(doc.CustomStructures) != 0 {
		t.Errorf("markets = %+v, structures = %+v, want the market moved",
			doc.MarketLocations, doc.CustomStructures)
	}
}

// The settings schema is not moving in this release, and the market move is
// deliberately not a reason to move it: the move is tested by the data, so it
// reaches a document whatever version it claims. A current raised here would
// hand every settings document to schema maintenance for a whole-document
// rewrite, and make three other release steps redundant on the way past.
func TestTheMarketMoveDidNotMoveTheSettingsSchema(t *testing.T) {
	if models.ApplicationSettingsSchemaCurrent != 1 {
		t.Errorf("ApplicationSettingsSchemaCurrent = %d, want 1 — the release step writes the move",
			models.ApplicationSettingsSchemaCurrent)
	}
	if planner.SettingsSchemaCurrent != 1 {
		t.Errorf("planner.SettingsSchemaCurrent = %d, want 1 — the release step writes the move",
			planner.SettingsSchemaCurrent)
	}
}
