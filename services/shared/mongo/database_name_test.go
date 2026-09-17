package mongo

import (
	"testing"

	"eve-industry-planner/shared/core/config"
)

// The URI the client dials and the database its handles bind to are the same
// name, resolved once. Two declarations could drift, and a handle bound to a
// database the URI never named reads an empty collection rather than failing.
func TestDatabaseName_followsTheResolver(t *testing.T) {
	if got, want := DatabaseName(), config.MongoDatabase(); got != want {
		t.Fatalf("DatabaseName() = %q, resolver says %q", got, want)
	}

	t.Setenv(config.EnvMongoDatabase, "eve_industry_planner_test")
	if got := DatabaseName(); got != "eve_industry_planner_test" {
		t.Fatalf("DatabaseName() = %q, want it to follow %s", got, config.EnvMongoDatabase)
	}
}
