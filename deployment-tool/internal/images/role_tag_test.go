package images

import (
	"testing"

	"eve-industry-planner/deployment-tool/internal/docker/enginetest"
)

const testRepo = "eve-industry-planner-capacity-controller"

// A role whose service is gone must still resolve a tag, or it can never be
// brought back: the tag needed to deploy it would only exist on the deployment
// that is missing.
func TestRoleTagFallsBackToTheNewestLocalImage(t *testing.T) {
	t.Parallel()
	engine := enginetest.New(t)
	engine.SetImageList(map[string]int64{
		testRepo + ":0.8.16-20260904210422": 100,
		testRepo + ":0.8.16-20260905022742": 300,
		testRepo + ":0.8.16-20260904215123": 200,
		testRepo + ":" + bakeWorkingTag:     400,
	})

	got, err := roleTag(t.Context(), engine.APIClient(), testRepo, "")
	if err != nil {
		t.Fatal(err)
	}
	if want := "0.8.16-20260905022742"; got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

// The working tag is overwritten by every bake, so pinning a stack entry to it
// would make the deployed image drift under the service.
func TestRoleTagNeverReturnsTheWorkingTag(t *testing.T) {
	t.Parallel()
	engine := enginetest.New(t)
	engine.SetImageList(map[string]int64{testRepo + ":" + bakeWorkingTag: 900})

	got, err := roleTag(t.Context(), engine.APIClient(), testRepo, "")
	if err != nil {
		t.Fatal(err)
	}
	if got != "" {
		t.Fatalf("got %q, want none", got)
	}
}

// A running service keeps its tag, so a deploy does not roll a service whose
// image did not change.
func TestRoleTagPrefersTheRunningService(t *testing.T) {
	t.Parallel()
	engine := enginetest.New(t)
	engine.SetImageList(map[string]int64{testRepo + ":0.8.16-newer": 900})

	got, err := roleTag(t.Context(), engine.APIClient(), testRepo, testRepo+":0.8.16-running")
	if err != nil {
		t.Fatal(err)
	}
	if want := "0.8.16-running"; got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestRoleTagWithNoLocalImageReturnsNothing(t *testing.T) {
	t.Parallel()
	engine := enginetest.New(t)

	got, err := roleTag(t.Context(), engine.APIClient(), testRepo, "")
	if err != nil {
		t.Fatal(err)
	}
	if got != "" {
		t.Fatalf("got %q, want none", got)
	}
}

// Another repo's tags must not satisfy this one.
func TestNewestLocalTagIgnoresOtherRepos(t *testing.T) {
	t.Parallel()
	engine := enginetest.New(t)
	engine.SetImageList(map[string]int64{"eve-industry-planner-api:0.8.16-other": 900})

	got, err := newestLocalTag(t.Context(), engine.APIClient(), testRepo)
	if err != nil {
		t.Fatal(err)
	}
	if got != "" {
		t.Fatalf("got %q, want none", got)
	}
}
