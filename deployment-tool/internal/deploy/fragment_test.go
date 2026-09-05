package deploy

import (
	"testing"

	"eve-industry-planner/deployment-tool/internal/catalogue"
	"eve-industry-planner/deployment-tool/internal/docker"
)

func TestFragmentStates(t *testing.T) {
	snap := docker.StackSnapshot{
		Present: true,
		Services: map[string]docker.ServiceInfo{
			"frontend":  {},
			"seaweedfs": {},
		},
	}
	states := FragmentStates(snap)
	by := map[string]FragmentState{}
	for _, s := range states {
		by[s.ID] = s
	}
	if by[catalogue.FragmentApp].OnStack < 1 || by[catalogue.FragmentData].OnStack < 1 {
		t.Fatalf("%+v", states)
	}
	if by[catalogue.FragmentObs].Present() {
		t.Fatal("obs should be absent")
	}
	if !by[catalogue.FragmentObs].Optional {
		t.Fatal("obs should be optional")
	}
}
