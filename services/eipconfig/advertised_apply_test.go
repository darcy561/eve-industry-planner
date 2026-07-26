package eipconfig_test

import (
	"testing"

	"eve-industry-planner/eipconfig"
)

func TestPlanAdvertisedVersion(t *testing.T) {
	t.Parallel()
	p := eipconfig.PlanAdvertisedVersion("", "0.8.0")
	if p.Changed {
		t.Fatal("empty want must not change Redis")
	}
	p = eipconfig.PlanAdvertisedVersion("0.9.0", "0.9.0")
	if p.Changed {
		t.Fatal("same version")
	}
	p = eipconfig.PlanAdvertisedVersion("0.9.0", "0.8.0")
	if !p.Changed || p.Want != "0.9.0" || p.Live != "0.8.0" {
		t.Fatalf("%+v", p)
	}
	p = eipconfig.PlanAdvertisedVersion("0.9.0", "(nil)")
	if !p.Changed || p.Live != "" {
		t.Fatalf("%+v", p)
	}
}
