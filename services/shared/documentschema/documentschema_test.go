package documentschema

import (
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
