package config

import (
	"testing"

	"eve-industry-planner/deployment-tool/internal/stack"
)

func TestCollectLabeledNetworkMemberships(t *testing.T) {
	t.Parallel()
	data := stack.Doc{
		Networks: map[string]stack.Network{
			"eip-core": {Name: "eip-core", External: true},
		},
	}
	obs := stack.Doc{
		Services: map[string]stack.Service{
			"grafana": {
				Deploy: stack.Deploy{Labels: stack.Labels{
					stack.LabelNetworkDetach:     "eip-core",
					stack.LabelNetworkAttach:     "eip-public",
					stack.LabelNetworkAttachWhen: "grafana.public",
				}},
			},
		},
		Networks: map[string]stack.Network{
			"eip-core":   {Name: "eip-core", External: true},
			"eip-obs":    {Name: "eip-obs"},
			"eip-public": {Name: "eip-public"},
		},
	}
	app := stack.Doc{
		Networks: map[string]stack.Network{
			"eip-public": {Name: "eip-public"},
		},
	}

	cfgObs := Config{Addons: Addons{Observability: ObservabilityAddon{Enabled: true}}}
	items, err := collectLabeledNetworkMemberships(cfgObs, []stack.Doc{data, app, obs}, []stack.Doc{data, app, obs})
	if err != nil {
		t.Fatal(err)
	}
	by := indexMemberships(items)
	if by["grafana|eip-core"].Attach {
		t.Fatal("grafana detach core")
	}
	if by["grafana|eip-public"].Attach {
		t.Fatal("grafana edge off when public false")
	}

	cfgPub := cfgObs
	cfgPub.Addons.Observability.Grafana.Public = true
	itemsPub, err := collectLabeledNetworkMemberships(cfgPub, []stack.Doc{data, app, obs}, []stack.Doc{data, app, obs})
	if err != nil {
		t.Fatal(err)
	}
	byPub := indexMemberships(itemsPub)
	if !byPub["grafana|eip-public"].Attach {
		t.Fatal("grafana edge on when public")
	}
}

func TestEvalAttachWhen(t *testing.T) {
	t.Parallel()
	cfg := Config{Addons: Addons{Observability: ObservabilityAddon{Enabled: true, Grafana: ObservabilityGrafana{Public: true}}}}
	ok, err := evalAttachWhen(cfg, "")
	if err != nil || !ok {
		t.Fatalf("empty when: %v %v", ok, err)
	}
	ok, err = evalAttachWhen(cfg, "grafana.public")
	if err != nil || !ok {
		t.Fatalf("grafana.public: %v %v", ok, err)
	}
	if _, err := evalAttachWhen(cfg, "nope"); err == nil {
		t.Fatal("want unknown when error")
	}
}

func TestSplitNetworkRefs(t *testing.T) {
	t.Parallel()
	got := splitNetworkRefs(" eip-obs , eip-other ")
	if len(got) != 2 || got[0] != "eip-obs" || got[1] != "eip-other" {
		t.Fatalf("%v", got)
	}
}

func indexMemberships(items []ServiceNetworkMembership) map[string]ServiceNetworkMembership {
	by := map[string]ServiceNetworkMembership{}
	for _, it := range items {
		by[it.ServiceShort+"|"+it.NetworkName] = it
	}
	return by
}
