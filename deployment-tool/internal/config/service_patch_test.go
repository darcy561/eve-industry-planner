package config

import (
	"context"
	"strings"
	"testing"

	swarmtypes "github.com/moby/moby/api/types/swarm"

	"eve-industry-planner/deployment-tool/internal/docker/enginetest"
)

func TestApplyServiceSpecPatchDryRunSkipsEngine(t *testing.T) {
	t.Parallel()
	eng := enginetest.New(t)
	err := ApplyServiceSpecPatch(context.Background(), eng.APIClient(), ServiceSpecPatch{
		ServiceName: "eip_worker",
		Labels:      map[string]string{"a": "1"},
	}, true)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := eng.LastServiceUpdate(); ok {
		t.Fatal("dry-run must not ServiceUpdate")
	}
}

func TestApplyServiceSpecPatchEmptyName(t *testing.T) {
	t.Parallel()
	eng := enginetest.New(t)
	err := ApplyServiceSpecPatch(context.Background(), eng.APIClient(), ServiceSpecPatch{}, false)
	if err == nil || !strings.Contains(err.Error(), "empty service name") {
		t.Fatalf("got %v", err)
	}
}

func TestApplyServiceSpecPatchInspectError(t *testing.T) {
	t.Parallel()
	eng := enginetest.New(t)
	eng.SetServiceError("eip_worker", 500, "daemon down")
	err := ApplyServiceSpecPatch(context.Background(), eng.APIClient(), ServiceSpecPatch{
		ServiceName: "eip_worker",
		Labels:      map[string]string{"a": "1"},
	}, false)
	if err == nil || !strings.Contains(err.Error(), "inspect service") {
		t.Fatalf("got %v", err)
	}
}

func TestApplyServiceSpecPatchLabelsEnvMutate(t *testing.T) {
	t.Parallel()
	eng := enginetest.New(t)
	var replicas uint64 = 1
	eng.SetServiceOK("eip_worker", swarmtypes.Service{
		ID: "worker-id",
		Meta: swarmtypes.Meta{
			Version: swarmtypes.Version{Index: 7},
		},
		Spec: swarmtypes.ServiceSpec{
			Annotations: swarmtypes.Annotations{
				Name: "eip_worker",
				Labels: map[string]string{
					"keep":             "yes",
					"traefik.enable":   "false",
					"eip.capacity.min": "1",
				},
			},
			TaskTemplate: swarmtypes.TaskSpec{
				ContainerSpec: &swarmtypes.ContainerSpec{
					Image: "worker:latest",
					Env: []string{
						"KEEP=1",
						"OLD=x",
						"UNSET_ME=1",
					},
				},
			},
			Mode: swarmtypes.ServiceMode{
				Replicated: &swarmtypes.ReplicatedService{Replicas: &replicas},
			},
		},
	})

	err := ApplyServiceSpecPatch(context.Background(), eng.APIClient(), ServiceSpecPatch{
		ServiceName: "eip_worker",
		Labels: map[string]string{
			"traefik.enable":   "true",
			"eip.capacity.min": "2",
		},
		Env: map[string]string{
			"OLD": "y",
			"NEW": "1",
		},
		EnvUnset: []string{"UNSET_ME"},
		Mutate: func(spec *swarmtypes.ServiceSpec) error {
			n := uint64(3)
			if spec.Mode.Replicated == nil {
				spec.Mode.Replicated = &swarmtypes.ReplicatedService{}
			}
			spec.Mode.Replicated.Replicas = &n
			return nil
		},
	}, false)
	if err != nil {
		t.Fatal(err)
	}

	call, ok := eng.LastServiceUpdate()
	if !ok {
		t.Fatal("want ServiceUpdate")
	}
	if call.ID != "worker-id" {
		t.Fatalf("update id=%q", call.ID)
	}
	if call.Version != "7" {
		t.Fatalf("version=%q", call.Version)
	}
	if call.Spec.Labels["keep"] != "yes" {
		t.Fatalf("keep label lost: %v", call.Spec.Labels)
	}
	if call.Spec.Labels["traefik.enable"] != "true" || call.Spec.Labels["eip.capacity.min"] != "2" {
		t.Fatalf("labels=%v", call.Spec.Labels)
	}
	env := parseEnvList(call.Spec.TaskTemplate.ContainerSpec.Env)
	if env["KEEP"] != "1" || env["OLD"] != "y" || env["NEW"] != "1" {
		t.Fatalf("env=%v", env)
	}
	if _, still := env["UNSET_ME"]; still {
		t.Fatalf("UNSET_ME still present: %v", env)
	}
	if call.Spec.Mode.Replicated == nil || call.Spec.Mode.Replicated.Replicas == nil || *call.Spec.Mode.Replicated.Replicas != 3 {
		t.Fatalf("replicas mutate failed: %+v", call.Spec.Mode)
	}
}

func TestApplyServiceSpecPatchMissingContainerSpecWithEnv(t *testing.T) {
	t.Parallel()
	eng := enginetest.New(t)
	eng.SetServiceOK("eip_bare", swarmtypes.Service{
		ID: "bare-id",
		Meta: swarmtypes.Meta{
			Version: swarmtypes.Version{Index: 1},
		},
		Spec: swarmtypes.ServiceSpec{
			Annotations: swarmtypes.Annotations{Name: "eip_bare"},
		},
	})
	err := ApplyServiceSpecPatch(context.Background(), eng.APIClient(), ServiceSpecPatch{
		ServiceName: "eip_bare",
		Env:         map[string]string{"A": "1"},
	}, false)
	if err == nil || !strings.Contains(err.Error(), "missing ContainerSpec") {
		t.Fatalf("got %v", err)
	}
}
