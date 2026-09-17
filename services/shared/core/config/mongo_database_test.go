package config

import (
	"strings"
	"testing"
)

func TestMongoDatabase_defaultsAndFollowsTheEnv(t *testing.T) {
	// A live run sets this in the ambient environment, and the unset case has to
	// mean unset rather than whatever the runner chose.
	t.Setenv(EnvMongoDatabase, "")

	if got := MongoDatabase(); got != DefaultMongoDatabase {
		t.Fatalf("unset: database = %q, want %q", got, DefaultMongoDatabase)
	}

	t.Setenv(EnvMongoDatabase, "eve_industry_planner_test")
	if got := MongoDatabase(); got != "eve_industry_planner_test" {
		t.Fatalf("set: database = %q, want the value set", got)
	}

	t.Setenv(EnvMongoDatabase, "   ")
	if got := MongoDatabase(); got != DefaultMongoDatabase {
		t.Fatalf("blank: database = %q, want the default", got)
	}
}

// The app user is created in the default database with readWrite on it, so
// authentication names that database whatever database the client then works in.
// A resolver that moved authSource too would fail auth on the first run.
func TestMongoURL_authSourceDoesNotFollowTheDatabase(t *testing.T) {
	t.Setenv("MONGO_HOST", "mongo")
	t.Setenv("MONGO_PORT", "27017")
	t.Setenv("MONGO_USERNAME", "shared")
	t.Setenv("MONGO_PASSWORD", "sharedpass")
	t.Setenv(EnvMongoDatabase, "eve_industry_planner_test")

	got, err := MongoURL()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "/eve_industry_planner_test?") {
		t.Fatalf("URI works in the wrong database: %s", got)
	}
	if !strings.Contains(got, "authSource="+DefaultMongoDatabase+"&") {
		t.Fatalf("authSource followed the database: %s", got)
	}
}
