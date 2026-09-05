package schemamaint_test

import (
	"testing"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/schemamaint"
)

// The rotation dispatches on this list, and so does the release drain. A
// collection in the list that schemamaint does not know fails at runtime, in a
// maintenance window, on live data.
func TestEverySchemaMaintainedCollectionIsSupported(t *testing.T) {
	t.Parallel()
	for _, name := range eipmongo.SchemaMaintainedCollections() {
		if _, err := schemamaint.CurrentVersion(name); err != nil {
			t.Fatalf("%s is in SchemaMaintainedCollections but schemamaint rejects it: %v", name, err)
		}
	}
}

func TestCurrentVersionMatchesTheModelConstants(t *testing.T) {
	t.Parallel()
	for name, want := range map[string]int{
		eipmongo.CollectionAccounts:        models.UserAccountDocumentSchemaCurrent,
		eipmongo.CollectionAccountSettings: models.ApplicationSettingsSchemaCurrent,
		eipmongo.CollectionJobDocuments:    models.JobSchemaCurrent,
		eipmongo.CollectionJobs:            models.JobSchemaCurrent,
		eipmongo.CollectionArchivedJobs:    models.JobSchemaCurrent,
		eipmongo.CollectionJobGroups:       models.GroupSchemaCurrent,
	} {
		got, err := schemamaint.CurrentVersion(name)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if got != want {
			t.Fatalf("%s reports v%d, model says v%d", name, got, want)
		}
	}
}

// A collection nothing maintains must be refused rather than silently treated as
// current, which would report a drain as complete having read nothing.
func TestUnsupportedCollectionIsRefused(t *testing.T) {
	t.Parallel()
	if _, err := schemamaint.CurrentVersion(eipmongo.CollectionStatisticsRows); err == nil {
		t.Fatal("want an error for a collection that carries no maintained schema")
	}
	if _, err := schemamaint.CurrentVersion("no_such_collection"); err == nil {
		t.Fatal("want an error for an unknown collection")
	}
}
