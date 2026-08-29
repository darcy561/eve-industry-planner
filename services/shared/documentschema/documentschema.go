// Package documentschema upgrades persisted documents to the current schema
// version. It sits above models so an upgrade step can call whatever it needs —
// models holds the shapes and the version constants, and never depends on the
// packages that transform them.
package documentschema

import (
	"time"

	"eve-industry-planner/shared/models"
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
}

// Group normalises legacy user_job_groups documents in memory. Idempotent.
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
