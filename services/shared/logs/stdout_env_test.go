package logs

import "testing"

func TestLogStdoutEnabled_explicitAndDevDefault(t *testing.T) {
	t.Setenv("LOG_STDOUT", "")
	t.Setenv("ENVIRONMENT", "")
	t.Setenv("DEPLOYMENT_ENVIRONMENT", "")
	if logStdoutEnabled() {
		t.Fatal("expected false when unset and not development")
	}

	t.Setenv("ENVIRONMENT", "development")
	if !logStdoutEnabled() {
		t.Fatal("expected true when ENVIRONMENT=development")
	}

	t.Setenv("LOG_STDOUT", "false")
	if logStdoutEnabled() {
		t.Fatal("expected LOG_STDOUT=false to win over development")
	}

	t.Setenv("LOG_STDOUT", "true")
	t.Setenv("ENVIRONMENT", "production")
	if !logStdoutEnabled() {
		t.Fatal("expected LOG_STDOUT=true to win over production")
	}
}
