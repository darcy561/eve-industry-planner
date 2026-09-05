package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/wsplacement"
)

func TestEligibleIDsDropsDraining(t *testing.T) {
	t.Parallel()
	ready := []string{"aaa111111111", "bbb222222222", "ccc333333333"}
	got := eligibleIDs(ready, map[string]bool{"bbb222222222": true})
	if len(got) != 2 || got[0] != "aaa111111111" || got[1] != "ccc333333333" {
		t.Fatalf("got %#v", got)
	}
}

func TestEligibleIDsDropsFull(t *testing.T) {
	t.Parallel()
	ready := []string{"aaa111111111", "bbb222222222"}
	got := eligibleIDs(ready, mergeSkip(map[string]bool{"aaa111111111": true}, nil))
	if len(got) != 1 || got[0] != "bbb222222222" {
		t.Fatalf("got %#v", got)
	}
}

func TestEligibleIDsAllSkippedFallsBack(t *testing.T) {
	t.Parallel()
	ready := []string{"aaa111111111", "bbb222222222"}
	got := eligibleIDs(ready, map[string]bool{"aaa111111111": true, "bbb222222222": true})
	if len(got) != 2 {
		t.Fatalf("expected fallback to all ready, got %#v", got)
	}
}

func TestMergeSkipUnionsFullAndDraining(t *testing.T) {
	t.Parallel()
	got := mergeSkip(
		map[string]bool{"aaa111111111": true},
		map[string]bool{"bbb222222222": true},
	)
	if !got["aaa111111111"] || !got["bbb222222222"] {
		t.Fatalf("got %#v", got)
	}
}

func TestPreferNewest(t *testing.T) {
	t.Parallel()
	vers := map[string]string{
		"aaa111111111": "0.8.25",
		"bbb222222222": "0.8.26",
		"ccc333333333": "0.8.26",
	}
	got := preferNewest([]string{"aaa111111111", "bbb222222222", "ccc333333333"}, func(s string) string {
		return vers[s]
	})
	if len(got) != 2 || got[0] != "bbb222222222" || got[1] != "ccc333333333" {
		t.Fatalf("got %#v", got)
	}
}

func TestPreferNewestMissingVersions(t *testing.T) {
	t.Parallel()
	ready := []string{"aaa111111111", "bbb222222222"}
	got := preferNewest(ready, func(string) string { return "" })
	if len(got) != 2 {
		t.Fatalf("expected fallback, got %#v", got)
	}
}

func TestCompareSemverXYZ(t *testing.T) {
	t.Parallel()
	if compareSemverXYZ("0.8.26", "0.8.25") <= 0 {
		t.Fatal("26 should be > 25")
	}
	if compareSemverXYZ("0.8.25", "0.8.25") != 0 {
		t.Fatal("equal")
	}
	if compareSemverXYZ("0.8.24", "0.8.25") >= 0 {
		t.Fatal("24 should be < 25")
	}
}

func TestPickBackendPrefersLowerClients(t *testing.T) {
	t.Parallel()
	place := newPlacementStore()
	place.applyState(eipnats.PlacementState{ContainerID: "aaa111111111", Clients: 5})
	place.applyState(eipnats.PlacementState{ContainerID: "bbb222222222", Clients: 1})
	r := &Router{place: place}
	got := r.pickBackend([]string{"aaa111111111", "bbb222222222"})
	if got != "bbb222222222" {
		t.Fatalf("got %s want bbb222222222", got)
	}
}

func TestPreferNonSoft(t *testing.T) {
	t.Parallel()
	preferred := []string{"aaa111111111", "bbb222222222", "ccc333333333"}
	got := preferNonSoft(preferred, map[string]bool{"aaa111111111": true, "ccc333333333": true})
	if len(got) != 1 || got[0] != "bbb222222222" {
		t.Fatalf("got %#v", got)
	}
}

func TestPreferNonSoftAllSoftFallsBack(t *testing.T) {
	t.Parallel()
	preferred := []string{"aaa111111111", "bbb222222222"}
	got := preferNonSoft(preferred, map[string]bool{"aaa111111111": true, "bbb222222222": true})
	if len(got) != 2 || got[0] != "aaa111111111" || got[1] != "bbb222222222" {
		t.Fatalf("expected all-soft fallback, got %#v", got)
	}
}

func TestPreferNonSoftEmptySoftUnchanged(t *testing.T) {
	t.Parallel()
	preferred := []string{"aaa111111111", "bbb222222222"}
	got := preferNonSoft(preferred, nil)
	if len(got) != 2 {
		t.Fatalf("got %#v", got)
	}
}

func TestEligibleIDsIgnoresSoft(t *testing.T) {
	t.Parallel()
	ready := []string{"aaa111111111", "bbb222222222"}
	got := eligibleIDs(ready, mergeSkip(nil, nil))
	if len(got) != 2 {
		t.Fatalf("got %#v", got)
	}
	softPreferred := preferNonSoft(got, map[string]bool{"aaa111111111": true})
	if len(softPreferred) != 1 || softPreferred[0] != "bbb222222222" {
		t.Fatalf("pick filter %#v", softPreferred)
	}
}

func TestFormatTruncate(t *testing.T) {
	t.Parallel()
	if truncate("abcdef", 3) != "abc" {
		t.Fatal("truncate")
	}
}

func TestShortContainerID(t *testing.T) {
	t.Parallel()
	if got := shortContainerID("bea90f22c969cede0123456789abcdef"); got != "bea90f22c969" {
		t.Fatalf("got %q", got)
	}
	if got := shortContainerID("sha256:bea90f22c969cede0123456789abcdef"); got != "bea90f22c969" {
		t.Fatalf("sha256 prefix: got %q", got)
	}
	if got := shortContainerID("  abcdefabcdef  "); got != "abcdefabcdef" {
		t.Fatalf("trim: got %q", got)
	}
	if got := shortContainerID(""); got != "" {
		t.Fatalf("empty: got %q", got)
	}
}

func TestPlacementStoreApplyAndPlace(t *testing.T) {
	t.Parallel()
	p := newPlacementStore()
	p.applyState(eipnats.PlacementState{
		ContainerID: "aaa111111111", Clients: 3, Soft: true, Full: false, Draining: true,
	})
	f := p.flagsOf("aaa111111111")
	if f.clients != 3 || !f.soft || !f.draining || f.full {
		t.Fatalf("flags %#v", f)
	}
	p.setPlace("alliance:1", "aaa111111111")
	got, ok := p.getPlace("alliance:1")
	if !ok || got != "aaa111111111" {
		t.Fatalf("place got %q ok=%v", got, ok)
	}
}

func TestResolveBackendPlaceHitAndMiss(t *testing.T) {
	t.Parallel()
	place := newPlacementStore()
	place.applyState(eipnats.PlacementState{ContainerID: "aaa111111111", Clients: 10})
	place.applyState(eipnats.PlacementState{ContainerID: "bbb222222222", Clients: 1})
	be := &backendRegistry{byID: map[string]backend{
		"aaa111111111": {ContainerID: "aaa111111111", IP: "10.0.0.1", AppVersion: "0.8.26"},
		"bbb222222222": {ContainerID: "bbb222222222", IP: "10.0.0.2", AppVersion: "0.8.26"},
	}}
	r := &Router{
		cfg:   config{AffinityCookie: wsplacement.AffinityCookie, StickyCookie: wsplacement.StickyCookie},
		be:    be,
		place: place,
	}

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.AddCookie(&http.Cookie{Name: wsplacement.AffinityCookie, Value: "alliance:9"})
	id, setSticky, result, err := r.resolveBackend(req.Context(), req)
	if err != nil {
		t.Fatal(err)
	}
	if setSticky {
		t.Fatal("place path should not set sticky")
	}
	if result != "miss" {
		t.Fatalf("result=%q want miss", result)
	}
	if id != "bbb222222222" {
		t.Fatalf("miss pick want lowest clients, got %s", id)
	}
	if got, ok := place.getPlace("alliance:9"); !ok || got != "bbb222222222" {
		t.Fatalf("place map %#v ok=%v", got, ok)
	}
	if r.placeMiss.Load() != 1 {
		t.Fatalf("miss=%d", r.placeMiss.Load())
	}

	req2 := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req2.AddCookie(&http.Cookie{Name: wsplacement.AffinityCookie, Value: "alliance:9"})
	id2, _, result2, err := r.resolveBackend(req2.Context(), req2)
	if err != nil {
		t.Fatal(err)
	}
	if id2 != "bbb222222222" {
		t.Fatalf("hit got %s", id2)
	}
	if result2 != "hit" {
		t.Fatalf("result=%q want hit", result2)
	}
	if r.placeHit.Load() != 1 {
		t.Fatalf("hit=%d", r.placeHit.Load())
	}
}

func TestResolveBackendReassignsFullHome(t *testing.T) {
	t.Parallel()
	place := newPlacementStore()
	place.applyState(eipnats.PlacementState{ContainerID: "aaa111111111", Clients: 1, Full: true})
	place.applyState(eipnats.PlacementState{ContainerID: "bbb222222222", Clients: 5})
	place.setPlace("account:1", "aaa111111111")
	be := &backendRegistry{byID: map[string]backend{
		"aaa111111111": {ContainerID: "aaa111111111", IP: "10.0.0.1", AppVersion: "0.8.26"},
		"bbb222222222": {ContainerID: "bbb222222222", IP: "10.0.0.2", AppVersion: "0.8.26"},
	}}
	r := &Router{
		cfg:   config{AffinityCookie: wsplacement.AffinityCookie, StickyCookie: wsplacement.StickyCookie},
		be:    be,
		place: place,
	}
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.AddCookie(&http.Cookie{Name: wsplacement.AffinityCookie, Value: "account:1"})
	id, _, _, err := r.resolveBackend(req.Context(), req)
	if err != nil {
		t.Fatal(err)
	}
	if id != "bbb222222222" {
		t.Fatalf("got %s", id)
	}
	if r.placeReassign.Load() != 1 || r.placeFull.Load() != 1 {
		t.Fatalf("reassign=%d full=%d", r.placeReassign.Load(), r.placeFull.Load())
	}
}

func TestResolveBackendReassignsDrainingHome(t *testing.T) {
	t.Parallel()
	place := newPlacementStore()
	place.applyState(eipnats.PlacementState{ContainerID: "aaa111111111", Clients: 1, Draining: true})
	place.applyState(eipnats.PlacementState{ContainerID: "bbb222222222", Clients: 5})
	place.setPlace("account:2", "aaa111111111")
	be := &backendRegistry{byID: map[string]backend{
		"aaa111111111": {ContainerID: "aaa111111111", IP: "10.0.0.1", AppVersion: "0.8.26"},
		"bbb222222222": {ContainerID: "bbb222222222", IP: "10.0.0.2", AppVersion: "0.8.26"},
	}}
	r := &Router{
		cfg:   config{AffinityCookie: wsplacement.AffinityCookie, StickyCookie: wsplacement.StickyCookie},
		be:    be,
		place: place,
	}
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.AddCookie(&http.Cookie{Name: wsplacement.AffinityCookie, Value: "account:2"})
	id, _, result, err := r.resolveBackend(req.Context(), req)
	if err != nil {
		t.Fatal(err)
	}
	if id != "bbb222222222" {
		t.Fatalf("got %s", id)
	}
	if result != "reassigned" {
		t.Fatalf("result=%q want reassigned", result)
	}
	if r.placeReassign.Load() != 1 || r.placeDrain.Load() != 1 {
		t.Fatalf("reassign=%d drain=%d", r.placeReassign.Load(), r.placeDrain.Load())
	}
}
