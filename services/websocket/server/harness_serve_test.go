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

func TestHarnessServe(t *testing.T) {
	if os.Getenv("EIP_WS_HARNESS") != "1" {
		t.Skip("harness: set EIP_WS_HARNESS=1 to serve")
	}

	if origins := os.Getenv("EIP_WS_HARNESS_ORIGINS"); origins != "" {
		t.Setenv("EIP_ALLOWED_ORIGINS", origins)
	}

	f := newIntegFixture(t)
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

	locks := documentlock.NewService(documentlock.DepsFromClients(f.Server.Stack))

	var position atomic.Uint64
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/shutdown" {
			stopOnce.Do(func() { close(stop) })
			w.WriteHeader(http.StatusNoContent)
			return
		}
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
		deliveries := make([]map[string]any, 0, len(body.Jobs)+len(body.JobIDs)+len(body.GroupIDs))
		for _, write := range body.Jobs {
			docID, _ := write["jobID"].(string)
			document, _ := write["document"].(map[string]any)
			deliveries = append(deliveries, map[string]any{
				"collection": eipmongo.CollectionJobDocuments,
				"docID":      docID, "operationType": "update", "document": document,
			})
		}
		for _, docID := range body.JobIDs {
			deliveries = append(deliveries, map[string]any{
				"collection": eipmongo.CollectionJobDocuments,
				"docID":      docID, "operationType": "delete",
			})
		}
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
