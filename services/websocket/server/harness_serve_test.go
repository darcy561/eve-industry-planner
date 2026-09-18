package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"eve-industry-planner/shared/core/documentlock"
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
	// Which account a session belongs to, which the lock service needs and the
	// request carries only as a session id.
	accountOfSession := map[string]string{}
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
		accountOfSession[parts[1]] = parts[0]
	}

	stop := make(chan struct{})
	var stopOnce sync.Once

	// The real lock service over the fixture's Redis, so a client takes a lock
	// through the calls its own code makes rather than through a stand-in.
	locks := documentlock.NewService(documentlock.DepsFromClients(f.Server.Stack))

	var position atomic.Uint64
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/shutdown" {
			stopOnce.Do(func() { close(stop) })
			w.WriteHeader(http.StatusNoContent)
			return
		}
		// Reads back the key a lock frame wrote, so a browser can assert which
		// planner the server scoped its pulse to rather than only that it sent
		// one. Answered here because the key is built from the owner ref, which
		// the browser never sees.
		if r.URL.Path == "/waitlist-pulse" {
			q := r.URL.Query()
			owner, oErr := models.ParseOwnerHandle(q.Get("owner"), f.Server.entityCipher)
			if oErr != nil {
				http.Error(w, "unreadable owner: "+oErr.Error(), http.StatusBadRequest)
				return
			}
			key := documentlock.WaitlistPulseKey(owner, q.Get("collection"), q.Get("docID"), q.Get("session"))
			present, rErr := f.Redis.Driver().Exists(r.Context(), key).Result()
			if rErr != nil {
				http.Error(w, "read pulse: "+rErr.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]bool{"present": present == 1})
			return
		}

		// The lock endpoints a client calls over HTTP. Answered with the service
		// the api uses, so a refusal here is the one a member would really meet.
		if action, isLock := strings.CutPrefix(r.URL.Path, "/api/v1/document-locks/"); isLock {
			owner, oErr := models.ParseOwnerHandle(r.Header.Get("X-Planner-Owner"), f.Server.entityCipher)
			if oErr != nil {
				http.Error(w, "unreadable planner owner: "+oErr.Error(), http.StatusBadRequest)
				return
			}
			var lockBody struct {
				Collection string `json:"collection"`
				DocID      string `json:"docID"`
			}
			if dErr := json.NewDecoder(r.Body).Decode(&lockBody); dErr != nil {
				http.Error(w, "unreadable body: "+dErr.Error(), http.StatusBadRequest)
				return
			}
			// A lock is scoped to the session holding it, so a request that names
			// none is not a request a browser makes — refused here rather than
			// written as a lock nobody holds.
			sessionID := r.Header.Get("X-Session-ID")
			accountID, known := accountOfSession[sessionID]
			if !known {
				http.Error(w, "no session for "+strconv.Quote(sessionID), http.StatusBadRequest)
				return
			}

			var out *documentlock.AcquireResult
			var lErr error
			switch action {
			case "acquire":
				out, lErr = locks.Acquire(r.Context(), owner, accountID, sessionID, lockBody.Collection, lockBody.DocID)
			case "force-release":
				out, lErr = locks.ForceReleaseSameAccount(r.Context(), owner, accountID, sessionID, lockBody.Collection, lockBody.DocID)
			default:
				http.Error(w, "harness serves no "+action, http.StatusNotFound)
				return
			}
			if lErr != nil {
				// The statuses the api answers for these, because a scenario
				// checking what a browser receives is checking exactly this.
				http.Error(w, action+": "+lErr.Error(), lockRefusalStatus(lErr))
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(out.StatusCode)
			_ = json.NewEncoder(w).Encode(out.Payload)
			return
		}

		owner, err := models.ParseOwnerHandle(r.Header.Get("X-Planner-Owner"), f.Server.entityCipher)
		if err != nil {
			http.Error(w, "unreadable planner owner: "+err.Error(), http.StatusBadRequest)
			return
		}
		// A read the app makes on the way up. Answered emptily rather than
		// refused: the app treats a refusal on these as its session being gone
		// and logs the tab out, which is not what a scenario is testing.
		if r.Method == http.MethodGet {
			w.Header().Set("Content-Type", "application/json")
			if strings.Contains(r.URL.Path, "/groups") ||
				strings.Contains(r.URL.Path, "/job-documents") {
				_, _ = w.Write([]byte("[]"))
				return
			}
			_, _ = w.Write([]byte("{}"))
			return
		}

		var body struct {
			Jobs     []map[string]any `json:"jobs"`
			JobIDs   []string         `json:"jobIDs"`
			GroupIDs []string         `json:"groupIDs"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "unreadable body: "+err.Error(), http.StatusBadRequest)
			return
		}
		// A delete travels the same path as a write and says so in its operation
		// type, carrying no document — which is what makes the position it carries
		// the only thing ordering it against the writes around it.
		deliveries := make([]map[string]any, 0, len(body.Jobs)+len(body.JobIDs)+len(body.GroupIDs))
		for _, job := range body.Jobs {
			docID, _ := job["jobID"].(string)
			deliveries = append(deliveries, map[string]any{
				"collection": eipmongo.CollectionJobDocuments,
				"docID":      docID, "operationType": "update", "document": job,
			})
		}
		for _, docID := range body.JobIDs {
			deliveries = append(deliveries, map[string]any{
				"collection": eipmongo.CollectionJobDocuments,
				"docID":      docID, "operationType": "delete",
			})
		}
		// A group delete reaches the other members the same way a job write does,
		// which is what lets a scenario delete one through the client's own path
		// rather than asking the fixture to announce it.
		for _, docID := range body.GroupIDs {
			deliveries = append(deliveries, map[string]any{
				"collection": eipmongo.CollectionJobGroups,
				"docID":      docID, "operationType": "delete",
			})
		}
		for _, delivery := range deliveries {
			docID, _ := delivery["docID"].(string)
			collection, _ := delivery["collection"].(string)
			delivery["ownerKey"] = owner.Key()
			frame, mErr := json.Marshal(delivery)
			if mErr != nil {
				http.Error(w, "unencodable delivery: "+mErr.Error(), http.StatusInternalServerError)
				return
			}
			f.Server.deliverOutboundDocUpdate(context.Background(),
				collection+"."+docID, frame, position.Add(1))
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

// lockRefusalStatus maps a lock service refusal the way
// api/v1endpoints/documentlocks does, so the harness refuses with the status a
// browser would really be given.
func lockRefusalStatus(err error) int {
	switch {
	case errors.Is(err, documentlock.ErrForceReleaseOtherAccount):
		return http.StatusConflict
	case errors.Is(err, documentlock.ErrForceReleaseNoLock):
		return http.StatusNotFound
	case errors.Is(err, documentlock.ErrForceReleaseSameSession):
		return http.StatusBadRequest
	case errors.Is(err, documentlock.ErrLocksUnavailable):
		return http.StatusServiceUnavailable
	default:
		return http.StatusInternalServerError
	}
}
