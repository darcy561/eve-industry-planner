package enginetest_test

import (
	"context"
	"testing"

	"github.com/containerd/errdefs"
	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/docker/enginetest"
)

func TestServiceInspectNotFoundVsError(t *testing.T) {
	t.Parallel()
	eng := enginetest.New(t)
	api := eng.APIClient()

	eng.SetServiceMissing("eip_missing")
	_, err := api.ServiceInspect(context.Background(), "eip_missing", client.ServiceInspectOptions{})
	if !errdefs.IsNotFound(err) {
		t.Fatalf("missing: want IsNotFound, got %v", err)
	}

	eng.SetServiceError("eip_broken", 500, "daemon down")
	_, err = api.ServiceInspect(context.Background(), "eip_broken", client.ServiceInspectOptions{})
	if err == nil || errdefs.IsNotFound(err) {
		t.Fatalf("500: want non-NotFound error, got %v", err)
	}
}
