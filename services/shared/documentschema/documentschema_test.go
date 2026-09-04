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

// Rows stored before the owner existed carry only an account id. Every read goes
// through here, so a row that keeps an empty owner reads as one nobody owns.
func TestArchivedJobStatsGainsAnOwnerFromItsAccount(t *testing.T) {
	t.Parallel()

	row := &models.ArchivedJobStats{AccountID: "acct-1"}
	Upgrader{}.ArchivedJobStats(row)

	if row.Owner != models.AccountOwner("acct-1") {
		t.Fatalf("owner = %+v, want the account it already named", row.Owner)
	}
	if row.SchemaVersion != models.ArchivedJobStatsSchemaCurrent {
		t.Fatalf("schemaVersion = %d", row.SchemaVersion)
	}
}

// A backfilled row already says who owns it, and that answer outranks the
// account id beside it — under a shared planner the two differ.
func TestArchivedJobStatsKeepsAnOwnerItAlreadyHas(t *testing.T) {
	t.Parallel()

	owner := models.Owner{Kind: models.OwnerCorporation, ID: "corp-ref"}
	row := &models.ArchivedJobStats{Owner: owner, AccountID: "acct-1"}
	Upgrader{}.ArchivedJobStats(row)

	if row.Owner != owner {
		t.Fatalf("owner = %+v, want the stored corporation owner", row.Owner)
	}
}

// A row with neither is not given a nonsense owner: an account id of "" would
// key documents nothing can find again.
func TestArchivedJobStatsWithNoAccountGetsNoOwner(t *testing.T) {
	t.Parallel()

	row := &models.ArchivedJobStats{}
	Upgrader{}.ArchivedJobStats(row)

	if !row.Owner.IsZero() {
		t.Fatalf("owner = %+v, want none", row.Owner)
	}
}

func TestArchivedJobStatsClampsFutureVersions(t *testing.T) {
	t.Parallel()

	row := &models.ArchivedJobStats{AccountID: "acct-1", SchemaVersion: 99}
	Upgrader{}.ArchivedJobStats(row)

	if row.SchemaVersion != models.ArchivedJobStatsSchemaCurrent {
		t.Fatalf("schemaVersion = %d, want it clamped", row.SchemaVersion)
	}
}

func testTime() time.Time {
	return time.Date(2026, 8, 21, 0, 0, 0, 0, time.UTC)
}
