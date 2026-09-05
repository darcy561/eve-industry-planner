package main

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/wsplacement"
)

func TestFetchPlacementStatus(t *testing.T) {
	t.Parallel()
	client := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path != wsplacement.StatusPath {
			t.Fatalf("path %s", req.URL.Path)
		}
		if req.URL.Port() != "4001" {
			t.Fatalf("port %s", req.URL.Port())
		}
		body := `{"container_id":"aaa111111111","clients":7,"soft":true,"full":false,"draining":false}`
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(body)),
			Header:     make(http.Header),
		}, nil
	}), Timeout: time.Second}
	state, err := fetchPlacementStatus(context.Background(), client, "4001", backend{
		ContainerID: "aaa111111111", IP: "10.0.0.1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if state.ContainerID != "aaa111111111" || state.Clients != 7 || !state.Soft {
		t.Fatalf("%#v", state)
	}
}

func TestReconcileStatusesPrunesGone(t *testing.T) {
	t.Parallel()
	p := newPlacementStore()
	gone, err := eipnats.ParsePlacementState([]byte(`{"container_id":"gone11111111","clients":1}`))
	if err != nil {
		t.Fatal(err)
	}
	live, err := eipnats.ParsePlacementState([]byte(`{"container_id":"aaa111111111","clients":2}`))
	if err != nil {
		t.Fatal(err)
	}
	p.applyState(gone)
	p.applyState(live)
	client := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		body := `{"container_id":"aaa111111111","clients":9,"soft":false,"full":true,"draining":false}`
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(body)),
			Header:     make(http.Header),
		}, nil
	}), Timeout: time.Second}
	p.reconcileStatuses(context.Background(), config{BackendPort: "4001"}, client, map[string]backend{
		"aaa111111111": {ContainerID: "aaa111111111", IP: "10.0.0.1"},
	})
	if p.flagsOf("gone11111111") != (placementFlags{}) {
		t.Fatal("expected gone pruned")
	}
	f := p.flagsOf("aaa111111111")
	if f.clients != 9 || !f.full {
		t.Fatalf("%#v", f)
	}
}

func TestReconcileStatusesKeysByDiscoveryID(t *testing.T) {
	t.Parallel()
	p := newPlacementStore()
	client := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		// Body container_id deliberately wrong — store must still key by discovery id.
		body := `{"container_id":"wrong99999999","clients":4,"soft":false,"full":false,"draining":true}`
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(body)),
			Header:     make(http.Header),
		}, nil
	}), Timeout: time.Second}
	p.reconcileStatuses(context.Background(), config{BackendPort: "4001"}, client, map[string]backend{
		"aaa111111111": {ContainerID: "aaa111111111", IP: "10.0.0.1"},
	})
	if p.flagsOf("wrong99999999") != (placementFlags{}) {
		t.Fatal("must not key by mismatched body container_id")
	}
	f := p.flagsOf("aaa111111111")
	if f.clients != 4 || !f.draining {
		t.Fatalf("%#v", f)
	}
}
