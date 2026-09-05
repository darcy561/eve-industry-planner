package enginetest_test

import (
	"context"
	"testing"

	"github.com/containerd/errdefs"
	swarmtypes "github.com/moby/moby/api/types/swarm"
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

func TestServiceUpdateCapture(t *testing.T) {
	t.Parallel()
	eng := enginetest.New(t)
	api := eng.APIClient()
	eng.SetServiceOK("eip_svc", swarmtypes.Service{
		ID:      "svc-id",
		Version: swarmtypes.Version{Index: 4},
		Spec: swarmtypes.ServiceSpec{
			Annotations: swarmtypes.Annotations{
				Name:   "eip_svc",
				Labels: map[string]string{"a": "1"},
			},
			TaskTemplate: swarmtypes.TaskSpec{
				ContainerSpec: &swarmtypes.ContainerSpec{Image: "x:latest"},
			},
		},
	})
	inspected, err := api.ServiceInspect(context.Background(), "eip_svc", client.ServiceInspectOptions{})
	if err != nil {
		t.Fatal(err)
	}
	spec := inspected.Service.Spec
	spec.Labels["a"] = "2"
	if _, err := api.ServiceUpdate(context.Background(), inspected.Service.ID, client.ServiceUpdateOptions{
		Version: inspected.Service.Version,
		Spec:    spec,
	}); err != nil {
		t.Fatal(err)
	}
	call, ok := eng.LastServiceUpdate()
	if !ok {
		t.Fatal("want update")
	}
	if call.ID != "svc-id" || call.Version != "4" || call.Spec.Labels["a"] != "2" {
		t.Fatalf("%+v", call)
	}
}
