// Package documentschema upgrades persisted documents to the current schema
// version. It sits above models so an upgrade step can call whatever it needs —
// models holds the shapes and the version constants, and never depends on the
// packages that transform them.
package documentschema

import (
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
)

// Upgrader holds the collaborators upgrade steps need. No step needs one today,
// so its zero value is usable everywhere; a step that later needs a dependency
// takes a field here and a constructor, without changing any call site.
type Upgrader struct{}

// UserAccountDocument normalises legacy rows in memory. Idempotent.
func (u Upgrader) UserAccountDocument(doc *models.UserAccountDocument) {
	if doc == nil {
		return
	}
	// Missing BSON field decodes to zero-value int.
	if doc.SchemaVersion <= 0 {
		doc.SchemaVersion = 0
	}
	if doc.SchemaVersion < 1 {
		doc.HasCompletedFirstLoginFlow = false
		doc.ShareCitadelNames = true
		doc.SchemaVersion = 1
	}
	if doc.SchemaVersion > models.UserAccountDocumentSchemaCurrent {
		doc.SchemaVersion = models.UserAccountDocumentSchemaCurrent
	}
}

// ApplicationSettings normalises legacy application_settings in memory. Idempotent.
// accountID and now are reserved for future steps that need DefaultApplicationSettings field fill.
func (u Upgrader) ApplicationSettings(doc *models.ApplicationSettings, accountID string, now time.Time) {
	if doc == nil {
		return
	}
	// Missing BSON field decodes to zero-value int; treat <=0 as "unversioned legacy doc".
	if doc.SchemaVersion <= 0 {
		doc.SchemaVersion = models.ApplicationSettingsSchemaCurrent
	}

	if doc.SchemaVersion < 1 {
		doc.CustomStructures.Invention = []models.InventionStructure{}
		doc.SchemaVersion = 1
	}
	if doc.SchemaVersion > models.ApplicationSettingsSchemaCurrent {
		doc.SchemaVersion = models.ApplicationSettingsSchemaCurrent
	}

	// Not gated on the schema version: an unversioned document is stamped with the
	// current one above, so a version test would never fire for the legacy rows
	// this fills. The empty market is the signal instead.
	// Only the two fields being filled: assigning the whole side would take its
	// market group table with it, and a side can carry groups without yet naming
	// a market of its own.
	if doc.DefaultPricing.Buying.Market == "" {
		doc.DefaultPricing.Buying.PricingChoice = legacyPricingChoice(doc)
	}
	// The market only: the selling side's basis follows from its route, so writing
	// one here would store a second answer to the same question, free to disagree.
	if doc.DefaultPricing.Selling.Market == "" {
		doc.DefaultPricing.Selling.Market = legacyPricingChoice(doc).Market
	}
	// Seeded separately from the market: a side may already name one and still
	// have no route, because the route is newer than the split that filled it.
	if doc.DefaultPricing.Selling.Exit == "" {
		doc.DefaultPricing.Selling.Exit = legacyExitRoute(doc)
	}
}

// legacyExitRoute is the route out an account was being quoted before it could
// say which one it took.
//
// Returns led with the listing for everyone, so an account that named the buy
// side was being priced from bids while reading a listing's fee. Taking the
// stored basis at its word repairs that where it was set, and leaves everyone
// else on the route they were already being shown.
func legacyExitRoute(doc *models.ApplicationSettings) string {
	// The stored side first, then the single default behind it: a document from
	// before the split has its only answer in the legacy field, and one from after
	// it carries a basis the route now replaces.
	basis := doc.DefaultPricing.Selling.Basis
	if basis == "" {
		basis = doc.DefaultOrderType
	}

	switch basis {
	case "buy", "buyP95":
		return models.ExitRouteImmediate
	default:
		return models.ExitRouteListed
	}
}

// legacyPricingChoice is the market and basis an account named before the buying
// and selling sides were told apart.
//
// Both sides seed from it: an account that named one market said nothing about
// which side of a job it meant, so neither side may claim it over the other.
func legacyPricingChoice(doc *models.ApplicationSettings) models.PricingChoice {
	choice := models.DefaultPricingDefaults().Buying.PricingChoice
	if doc.DefaultMarketLocation != "" {
		choice.Market = doc.DefaultMarketLocation
	}
	if doc.DefaultOrderType != "" {
		choice.Basis = doc.DefaultOrderType
	}
	return choice
}

// Group normalises legacy job_groups documents in memory. Idempotent.
func (u Upgrader) Group(doc *models.Group) {
	if doc == nil {
		return
	}
	if doc.SchemaVersion <= 0 {
		doc.SchemaVersion = models.GroupSchemaCurrent
	}
	if doc.SchemaVersion > models.GroupSchemaCurrent {
		doc.SchemaVersion = models.GroupSchemaCurrent
	}
}

// Job normalises legacy job documents in memory. Idempotent.
//
// How job identity is stored is not a schema concern: entity ids are converted to
// refs on write and the document records which field set was applied. See
// shared/jobidentity.
func (u Upgrader) Job(doc *models.Job) {
	if doc == nil {
		return
	}
	if doc.SchemaVersion <= 0 {
		doc.SchemaVersion = models.JobSchemaCurrent
	}
	if doc.SchemaVersion > models.JobSchemaCurrent {
		doc.SchemaVersion = models.JobSchemaCurrent
	}
}

// ArchivedJobStats normalises a statistics row in memory. Idempotent.
//
// A row written before the owner existed carries only AccountID, so the owner is
// filled from it. That is what makes every read correct from the moment this
// ships: the stored rows are backfilled separately, and until they are, a reader
// that asked the row who owns it would get nothing.
//
// Unlike the documents a user owns, a row is derived — the way to bring one to
// the current shape on disk is the rebuild that already rewrites it.
func (u Upgrader) ArchivedJobStats(doc *models.ArchivedJobStats) {
	if doc == nil {
		return
	}
	if doc.SchemaVersion <= 0 {
		doc.SchemaVersion = models.ArchivedJobStatsSchemaCurrent
	}
	if doc.SchemaVersion > models.ArchivedJobStatsSchemaCurrent {
		doc.SchemaVersion = models.ArchivedJobStatsSchemaCurrent
	}
}

// Planner normalises a planner document in memory. Idempotent.
func (u Upgrader) Planner(doc *planner.Planner) {
	if doc == nil {
		return
	}
	if doc.SchemaVersion <= 0 || doc.SchemaVersion > planner.SchemaCurrent {
		doc.SchemaVersion = planner.SchemaCurrent
	}
}

// PlannerMembership normalises a membership row in memory. Idempotent.
func (u Upgrader) PlannerMembership(doc *planner.Membership) {
	if doc == nil {
		return
	}
	if doc.SchemaVersion <= 0 || doc.SchemaVersion > planner.MembershipSchemaCurrent {
		doc.SchemaVersion = planner.MembershipSchemaCurrent
	}
}

// PlannerSettings normalises a planner's settings in memory. Idempotent.
func (u Upgrader) PlannerSettings(doc *planner.Settings) {
	if doc == nil {
		return
	}
	if doc.SchemaVersion <= 0 || doc.SchemaVersion > planner.SettingsSchemaCurrent {
		doc.SchemaVersion = planner.SettingsSchemaCurrent
	}
}
