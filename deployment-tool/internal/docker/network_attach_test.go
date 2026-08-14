package docker

import (
	"testing"

	swarmtypes "github.com/moby/moby/api/types/swarm"
)

func TestDesireNetworksAttachDetach(t *testing.T) {
	t.Parallel()
	cur := []swarmtypes.NetworkAttachmentConfig{{Target: "eip-core"}}
	next, changed := desireNetworks(cur, "eip-obs", "id-obs", true, nil)
	if !changed || len(next) != 2 || next[1].Target != "eip-obs" {
		t.Fatalf("attach: %+v changed=%v", next, changed)
	}
	next2, changed2 := desireNetworks(next, "eip-obs", "id-obs", true, nil)
	if changed2 {
		t.Fatal("idempotent attach should not change")
	}
	_ = next2
	detached, changed3 := desireNetworks(next, "eip-obs", "id-obs", false, nil)
	if !changed3 || len(detached) != 1 || detached[0].Target != "eip-core" {
		t.Fatalf("detach: %+v", detached)
	}
	// Match by ID when inspect used id as Target.
	withID := []swarmtypes.NetworkAttachmentConfig{{Target: "id-obs"}}
	gone, changed4 := desireNetworks(withID, "eip-obs", "id-obs", false, nil)
	if !changed4 || len(gone) != 0 {
		t.Fatalf("detach by id: %+v", gone)
	}
}

func TestDesireNetworksAliases(t *testing.T) {
	t.Parallel()
	cur := []swarmtypes.NetworkAttachmentConfig{{Target: "eip-obs", Aliases: []string{"old"}}}
	next, changed := desireNetworks(cur, "eip-obs", "id", true, []string{"prometheus"})
	if !changed || len(next) != 1 || next[0].Aliases[0] != "prometheus" {
		t.Fatalf("%+v", next)
	}
}

func TestFullServiceName(t *testing.T) {
	t.Parallel()
	if got := FullServiceName("eip", "prometheus"); got != "eip_prometheus" {
		t.Fatalf("got %q", got)
	}
	if got := FullServiceName("", "prometheus"); got != "prometheus" {
		t.Fatalf("got %q", got)
	}
}

func TestNetworkTargetsContain(t *testing.T) {
	t.Parallel()
	targets := []string{"id-obs"}
	if !NetworkTargetsContain(targets, "eip-obs", "id-obs") {
		t.Fatal("want ID match")
	}
	if NetworkTargetsContain(targets, "eip-obs", "") {
		t.Fatal("name-only should miss when Target is ID")
	}
	if !NetworkTargetsContain([]string{"eip-obs"}, "eip-obs", "id-obs") {
		t.Fatal("want name match")
	}
}
