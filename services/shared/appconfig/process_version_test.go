package appconfig

import (
	"testing"
)

func TestProcessAppVersion_fromEnv(t *testing.T) {
	t.Setenv("FRONTEND_APP_VERSION", "")
	t.Setenv("APP_VERSION_NUMBER", "")
	t.Setenv("APP_VERSION", "1.2.3")
	if got := ProcessAppVersion(); got != "1.2.3" {
		t.Fatalf("ProcessAppVersion=%q", got)
	}
	if got := AdvertisedAppVersion(); got != "1.2.3" {
		t.Fatalf("AdvertisedAppVersion=%q", got)
	}
}

func TestProcessAppVersion_frontendWins(t *testing.T) {
	t.Setenv("FRONTEND_APP_VERSION", "fe-9")
	t.Setenv("APP_VERSION_NUMBER", "num-8")
	t.Setenv("APP_VERSION", "app-7")
	if got := ProcessAppVersion(); got != "fe-9" {
		t.Fatalf("got %q", got)
	}
}
