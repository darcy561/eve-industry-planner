package swarm

import (
	"context"
	"testing"

	swarmtypes "github.com/moby/moby/api/types/swarm"

	"eve-industry-planner/deployment-tool/internal/docker/enginetest"
)

func configRef(name, target string) *swarmtypes.ConfigReference {
	return &swarmtypes.ConfigReference{
		ConfigName: name,
		File:       &swarmtypes.ConfigReferenceFileTarget{Name: target},
	}
}

func TestDropUnwantedConfigMounts(t *testing.T) {
	t.Parallel()
	eng := enginetest.New(t)
	eng.SetServiceOK("eip_grafana", swarmtypes.Service{
		ID:      "grafana-id",
		Version: swarmtypes.Version{Index: 7},
		Spec: swarmtypes.ServiceSpec{
			Annotations: swarmtypes.Annotations{Name: "eip_grafana"},
			TaskTemplate: swarmtypes.TaskSpec{
				ContainerSpec: &swarmtypes.ContainerSpec{
					Image: "grafana:x",
					Configs: []*swarmtypes.ConfigReference{
						configRef("eip_grafana_dash_redis_abc123", "/defs/redis.json"),
						configRef("eip_grafana_dash_gone_def456", "/defs/gone.json"),
						configRef("someone_elses_config", "/defs/other.json"),
					},
				},
			},
		},
	})

	wanted := map[string]bool{"/defs/redis.json": true}
	n, err := dropUnwantedConfigMounts(context.Background(), eng.APIClient(), "eip_grafana", wanted, false)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("dropped=%d, want 1", n)
	}

	call, ok := eng.LastServiceUpdate()
	if !ok {
		t.Fatal("no service update captured")
	}
	got := map[string]bool{}
	for _, ref := range call.Spec.TaskTemplate.ContainerSpec.Configs {
		got[ref.ConfigName] = true
	}
	if got["eip_grafana_dash_gone_def456"] {
		t.Fatal("mount whose key left the fragment must be dropped")
	}
	if !got["eip_grafana_dash_redis_abc123"] {
		t.Fatal("wanted mount must survive")
	}
	if !got["someone_elses_config"] {
		t.Fatal("must not touch configs outside the eip_ namespace")
	}
}

func TestDropUnwantedConfigMountsNoopWhenAllWanted(t *testing.T) {
	t.Parallel()
	eng := enginetest.New(t)
	eng.SetServiceOK("eip_grafana", swarmtypes.Service{
		ID:      "grafana-id",
		Version: swarmtypes.Version{Index: 1},
		Spec: swarmtypes.ServiceSpec{
			Annotations: swarmtypes.Annotations{Name: "eip_grafana"},
			TaskTemplate: swarmtypes.TaskSpec{
				ContainerSpec: &swarmtypes.ContainerSpec{
					Configs: []*swarmtypes.ConfigReference{
						configRef("eip_grafana_dash_redis_abc123", "/defs/redis.json"),
					},
				},
			},
		},
	})

	n, err := dropUnwantedConfigMounts(context.Background(), eng.APIClient(), "eip_grafana", map[string]bool{"/defs/redis.json": true}, false)
	if err != nil || n != 0 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	if _, ok := eng.LastServiceUpdate(); ok {
		t.Fatal("must not roll a service with nothing to drop")
	}
}

func TestDropUnwantedConfigMountsSkipsMissingService(t *testing.T) {
	t.Parallel()
	eng := enginetest.New(t)
	n, err := dropUnwantedConfigMounts(context.Background(), eng.APIClient(), "eip_grafana", map[string]bool{}, false)
	if err != nil || n != 0 {
		t.Fatalf("undeployed service: n=%d err=%v", n, err)
	}
}
