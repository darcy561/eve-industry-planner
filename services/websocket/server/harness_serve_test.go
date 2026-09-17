package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

// TestHarnessServe is not a test. It is how a suite outside this module — the
// SPA's round-trip test — gets a real websocket server to talk to, without a
// stack: the same fixture the integration tests use, served until it is told to
// stop.
//
// It stands in for the api, Mongo and the change stream between two browsers,
// and says so: a write arrives on the door the SPA already posts to, and comes
// back out as the delivery the websocket service would have fanned out.
//
// Set EIP_WS_HARNESS=1 to run it. Sessions come from EIP_WS_HARNESS_SESSIONS as
// `accountID:sessionID:corporationID`, comma separated.
func TestHarnessServe(t *testing.T) {
	if os.Getenv("EIP_WS_HARNESS") != "1" {
		t.Skip("harness: set EIP_WS_HARNESS=1 to serve")
	}

	// A browser sends Origin and the server checks it, so the caller's document
	// origin has to be allowed or every upgrade is refused — which is the server
	// behaving correctly and the harness looking broken.
	if origins := os.Getenv("EIP_WS_HARNESS_ORIGINS"); origins != "" {
		t.Setenv("EIP_ALLOWED_ORIGINS", origins)
	}

	f := newIntegFixture(t)
	for spec := range strings.SplitSeq(os.Getenv("EIP_WS_HARNESS_SESSIONS"), ",") {
		parts := strings.Split(strings.TrimSpace(spec), ":")
		if len(parts) != 3 {
			t.Fatalf("harness: session spec %q is not accountID:sessionID:corporationID", spec)
		}
		var corp int64
		if _, err := fmt.Sscanf(parts[2], "%d", &corp); err != nil {
			t.Fatalf("harness: corporation id in %q: %v", spec, err)
		}
		f.seedSessionWithGrants(parts[0], parts[1], []int64{corp}, nil)
	}

	stop := make(chan struct{})
	var stopOnce sync.Once

	var position atomic.Uint64
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/shutdown" {
			stopOnce.Do(func() { close(stop) })
			w.WriteHeader(http.StatusNoContent)
			return
		}
		owner, err := models.ParseOwnerHandle(r.Header.Get("X-Planner-Owner"), f.Server.entityCipher)
		if err != nil {
			http.Error(w, "unreadable planner owner: "+err.Error(), http.StatusBadRequest)
			return
		}
		var body struct {
			Jobs   []map[string]any `json:"jobs"`
			JobIDs []string         `json:"jobIDs"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "unreadable body: "+err.Error(), http.StatusBadRequest)
			return
		}
		// A delete travels the same path as a write and says so in its operation
		// type, carrying no document — which is what makes the position it carries
		// the only thing ordering it against the writes around it.
		deliveries := make([]map[string]any, 0, len(body.Jobs)+len(body.JobIDs))
		for _, job := range body.Jobs {
			docID, _ := job["jobID"].(string)
			deliveries = append(deliveries, map[string]any{
				"docID": docID, "operationType": "update", "document": job,
			})
		}
		for _, docID := range body.JobIDs {
			deliveries = append(deliveries, map[string]any{
				"docID": docID, "operationType": "delete",
			})
		}
		for _, delivery := range deliveries {
			docID, _ := delivery["docID"].(string)
			delivery["collection"] = eipmongo.CollectionJobDocuments
			delivery["ownerKey"] = owner.Key()
			frame, mErr := json.Marshal(delivery)
			if mErr != nil {
				http.Error(w, "unencodable delivery: "+mErr.Error(), http.StatusInternalServerError)
				return
			}
			f.Server.deliverOutboundDocUpdate(context.Background(),
				eipmongo.CollectionJobDocuments+"."+docID, frame, position.Add(1))
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer api.Close()

	fmt.Printf("HARNESS_WS %s\nHARNESS_API %s\n", f.HTTP.URL, api.URL)
	os.Stdout.Sync()

	ttl := 300 * time.Second
	if raw := os.Getenv("EIP_WS_HARNESS_TTL"); raw != "" {
		var secs int
		if _, err := fmt.Sscanf(raw, "%d", &secs); err == nil && secs > 0 {
			ttl = time.Duration(secs) * time.Second
		}
	}
	select {
	case <-stop:
	case <-time.After(ttl):
		t.Logf("harness: no caller said stop within %s", ttl)
	}
}
