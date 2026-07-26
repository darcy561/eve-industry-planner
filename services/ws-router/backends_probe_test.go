package main

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/orchestrationprobes"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestProbeReadyStatusCodes(t *testing.T) {
	t.Parallel()
	reg := &backendRegistry{
		cfg: config{BackendProbeTimeout: time.Second},
		probeHTTP: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			if req.URL.Path != "/ready" || req.URL.Port() != orchestrationprobes.ListenPort {
				t.Fatalf("unexpected url %s", req.URL)
			}
			code := http.StatusOK
			if req.URL.Hostname() == "10.0.0.2" {
				code = http.StatusServiceUnavailable
			}
			return &http.Response{
				StatusCode: code,
				Body:       io.NopCloser(strings.NewReader("x")),
				Header:     make(http.Header),
			}, nil
		})},
	}
	if !reg.probeReady(context.Background(), "10.0.0.1") {
		t.Fatal("want ready")
	}
	if reg.probeReady(context.Background(), "10.0.0.2") {
		t.Fatal("want not ready")
	}
	if reg.probeReady(context.Background(), "") {
		t.Fatal("empty ip")
	}
}

func TestFilterProbeReady(t *testing.T) {
	t.Parallel()
	reg := &backendRegistry{
		cfg: config{BackendProbeTimeout: time.Second},
		probeHTTP: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			code := http.StatusOK
			if req.URL.Hostname() == "10.0.0.2" {
				code = http.StatusServiceUnavailable
			}
			return &http.Response{
				StatusCode: code,
				Body:       io.NopCloser(strings.NewReader("x")),
				Header:     make(http.Header),
			}, nil
		})},
	}
	got := reg.filterProbeReady(context.Background(), map[string]backend{
		"websocket-1": {Slot: "websocket-1", IP: "10.0.0.1"},
		"websocket-2": {Slot: "websocket-2", IP: "10.0.0.2"},
	})
	if len(got) != 1 || got["websocket-1"].IP != "10.0.0.1" {
		t.Fatalf("got %#v", got)
	}
}
