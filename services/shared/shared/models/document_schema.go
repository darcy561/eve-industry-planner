package models

import "time"

// Document schema versions for Mongo singletons (users, application_settings).
// When you add fields or change shape: bump *SchemaCurrent and add a new "vN -> vN+1"
// block in the matching Upgrade* function. Do not replace the whole document with
// Default* — only set new fields or transform data for that step.
const (
	UserAccountDocumentSchemaCurrent = 1
	ApplicationSettingsSchemaCurrent = 1
	JobSchemaCurrent                 = 1
	GroupSchemaCurrent               = 1
)

// UpgradeUserAccountDocument normalizes legacy rows in memory. Idempotent.
func UpgradeUserAccountDocument(doc *UserAccountDocument) {
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
	if doc.SchemaVersion > UserAccountDocumentSchemaCurrent {
		doc.SchemaVersion = UserAccountDocumentSchemaCurrent
	}
}

// UpgradeApplicationSettings normalizes legacy application_settings in memory. Idempotent.
// accountID and now are reserved for future steps that need DefaultApplicationSettings field fill.
func UpgradeApplicationSettings(doc *ApplicationSettings, accountID string, now time.Time) {
	if doc == nil {
		return
	}
	// Missing BSON field decodes to zero-value int; treat <=0 as "unversioned legacy doc".
	if doc.SchemaVersion <= 0 {
		doc.SchemaVersion = ApplicationSettingsSchemaCurrent
	}

	if doc.SchemaVersion < 1 {
		doc.CustomStructures.Invention = []InventionStructure{}
		doc.SchemaVersion = 1
	}
	if doc.SchemaVersion > ApplicationSettingsSchemaCurrent {
		doc.SchemaVersion = ApplicationSettingsSchemaCurrent
	}
}

// UpgradeJob normalizes legacy job documents in memory. Idempotent.
func UpgradeJob(doc *Job) {
	if doc == nil {
		return
	}
	if doc.SchemaVersion <= 0 {
		doc.SchemaVersion = JobSchemaCurrent
	}
	if doc.SchemaVersion > JobSchemaCurrent {
		doc.SchemaVersion = JobSchemaCurrent
	}
}

// UpgradeGroup normalizes legacy user_job_groups documents in memory. Idempotent.
func UpgradeGroup(doc *Group) {
	if doc == nil {
		return
	}
	if doc.SchemaVersion <= 0 {
		doc.SchemaVersion = GroupSchemaCurrent
	}
	if doc.SchemaVersion > GroupSchemaCurrent {
		doc.SchemaVersion = GroupSchemaCurrent
	}
}
