package models

// Document schema versions for persisted Mongo documents.
// When you add fields or change shape: bump *SchemaCurrent and add a new "vN -> vN+1"
// block in the matching shared/documentschema Upgrader method. Do not replace the
// whole document with Default* — only set new fields or transform data for that step.
const (
	UserAccountDocumentSchemaCurrent = 1
	ApplicationSettingsSchemaCurrent = 1
	JobSchemaCurrent                 = 1
	GroupSchemaCurrent               = 1
	ArchivedJobStatsSchemaCurrent    = 2
)

// JobSchemaVersionPath is where a job's stored shape is recorded, for a write
// that names its paths rather than sending the document whole.
const JobSchemaVersionPath = "schemaVersion"
