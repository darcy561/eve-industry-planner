package mongo

import (
	"testing"

	"eve-industry-planner/shared/core/config"
)

func TestDatabaseName_followsTheResolver(t *testing.T) {
	if got, want := DatabaseName(), config.MongoDatabase(); got != want {
		t.Fatalf("DatabaseName() = %q, resolver says %q", got, want)
	}

	t.Setenv(config.EnvMongoDatabase, "eve_industry_planner_test")
	if got := DatabaseName(); got != "eve_industry_planner_test" {
		t.Fatalf("DatabaseName() = %q, want it to follow %s", got, config.EnvMongoDatabase)
	}
}
