package jobdocuments

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"encoding/json/jsontext"

	"eve-industry-planner/shared/jsoncodec"

	"eve-industry-planner/core/changestream"
	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/mongolive"
	"eve-industry-planner/testing/plannersessions"
	"eve-industry-planner/testing/wsclient"

	eipmongo "eve-industry-planner/shared/mongo"
)

const (
	loopSaverTab    = "eip-loop-saver-tab"
	loopSecondTab   = "eip-loop-second-tab"
	loopThirdTab    = "eip-loop-third-tab"
	loopAwayTab     = "eip-loop-away-tab"
	loopAllianceID  = 99000123
	loopJobID       = "eip-loop-job"
	loopWaitForSeen = 20 * time.Second
	loopWaitForNone = 3 * time.Second
)

func loopWebsocketURL() string {
	if url := os.Getenv("EIP_WS_URL"); url != "" {
		return url
	}
	return "ws://traefik:80/ws"
}

func stackRedis(t *testing.T) *eipredis.Redis {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	redis, err := eipredis.Connect(ctx)
	if err != nil {
		t.Skipf("the stack's Redis is unreachable, so no session can be seeded: %v", err)
	}
	t.Cleanup(func() { _ = redis.Close() })
	return redis
}

func TestLive_FullLoop_aSaveReachesTheOtherTabsAndNotTheOneThatMadeIt(t *testing.T) {
	s := newPlannerScope(t)
	redis := stackRedis(t)

	allianceRef, err := s.cipher.Alliance(loopAllianceID)
	if err != nil {
		t.Fatalf("encrypt alliance: %v", err)
	}
	planners := []loopPlanner{
		{name: "an account's own planner", owner: models.AccountOwner(s.account)},
		{name: "a corporation's planner", owner: s.owner},
		{name: "an alliance's planner", owner: models.AllianceOwner(allianceRef)},
	}

	granted := models.NewOwnerKeys()
	joined := make([]models.Owner, 0, len(planners))
	for i := range planners {
		granted = granted.Add(planners[i].owner)
		if planners[i].handle, err = models.OwnerHandle(planners[i].owner, s.cipher); err != nil {
			t.Fatalf("owner handle: %v", err)
		}
		if planners[i].owner.Kind != models.OwnerAccount {
			joined = append(joined, planners[i].owner)
		}
	}
	if _, _, err := s.mongo.ReconcileEntityMemberships(context.Background(),
		s.account, joined, time.Now().UTC()); err != nil {
		t.Fatalf("join the planners this account works in: %v", err)
	}
	for _, session := range []string{loopSaverTab, loopSecondTab, loopThirdTab, loopAwayTab} {
		plannersessions.Open(t, redis, s.account, session, granted)
	}

	watcher := changestream.NewWatcher(
		mongolive.RequireWatch(t, len(changestream.CollectionGroups())), nats(t), nil)
	t.Cleanup(watcher.Start(changestream.CollectionGroups()))

	for i, planner := range planners {
		t.Run(planner.name, func(t *testing.T) {
			if planner.owner.Kind != models.OwnerAccount && os.Getenv(entityid.EnvKey) == "" {
				t.Skipf("an owner carrying a ref needs the stack's %s: without it this test mints refs "+
					"with the fixed test key, so the handle it names is one the stack cannot read and "+
					"the connection is refused as outside its grants", entityid.EnvKey)
			}
			s.owner, s.handle = planner.owner, planner.handle
			oneSaveReachesTheOtherTabs(t, s, planners[(i+1)%len(planners)])
		})
	}
}

type loopPlanner struct {
	name   string
	owner  models.Owner
	handle string
}

func oneSaveReachesTheOtherTabs(t *testing.T, s *plannerScope, elsewhere loopPlanner) {
	t.Helper()

	jobID := loopJobID + "-" + string(s.owner.Kind)
	seed := models.Job{
		JobID: jobID, Name: "Before the save", ItemID: 587,
		Build: models.JobBuild{
			ExtrasCosts: map[string]models.ExtraCost{
				"e-1": {ID: "e-1", ExtraText: "Courier", ExtraValue: 120000},
			},
		},
	}
	if rec := s.putJobs([]models.Job{seed}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("seed write = %d: %s", rec.Code, rec.Body.String())
	}
	stored := storedJob(t, s, jobID)

	url := loopWebsocketURL()
	saver := wsclient.Dial(t, url, loopSaverTab, 15*time.Second)
	second := wsclient.Dial(t, url, loopSecondTab, 15*time.Second)
	third := wsclient.Dial(t, url, loopThirdTab, 15*time.Second)
	for _, client := range []*wsclient.Client{saver, second, third} {
		client.WorkIn(t, s.handle)
	}

	away := wsclient.Dial(t, url, loopAwayTab, 15*time.Second)
	away.WorkIn(t, elsewhere.handle)

	here := loopPlanner{name: "the planner saved in", owner: s.owner, handle: s.handle}
	awaitDeliveryReady(t, s, here, saver, second, third)
	awaitDeliveryReady(t, s, elsewhere, away)

	rec := s.putWritesAsSession([]models.JobWriteBody{{
		JobID:    jobID,
		Revision: stored.MetaData.Revision,
		Document: loopDocumentNaming(t, "After the save"),
		Removed:  [][]string{{"build", "extrasCosts", "e-1"}},
	}}, s.account, s.handle, loopSaverTab, saver.ClientID)
	if rec.Code >= http.StatusBadRequest {
		t.Fatalf("the save was refused: %d — %s", rec.Code, rec.Body.String())
	}

	arrived := wsclient.DocumentUpdateFor(eipmongo.CollectionJobDocuments, jobID)

	assertLoopDelta(t, "a second tab", second.Await(t, loopWaitForSeen, arrived),
		stored.MetaData.Revision+1)
	assertLoopDelta(t, "a third tab", third.Await(t, loopWaitForSeen, arrived),
		stored.MetaData.Revision+1)

	saver.Quiet(t, loopWaitForNone, arrived)
	recordLoopCapture(t, s, jobID, stored, second)

	aChangeThatRemovesReachesTheOtherTabs(t, s, jobID, saver, second, third)

	if s.owner.Kind == models.OwnerAccount {
		t.Log("a tab working in another planner is still sent this one's jobs, because an " +
			"account's own key survives the switch and a personal planner's jobs are held under it")
		return
	}
	away.Quiet(t, loopWaitForNone, arrived)
}

func aChangeThatRemovesReachesTheOtherTabs(t *testing.T, s *plannerScope, keptID string, saver, second, third *wsclient.Client) {
	t.Helper()

	removedID := keptID + "-removed"
	if rec := s.putJobs([]models.Job{{JobID: removedID, Name: "Replaced", ItemID: 587}}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("seed the job to remove = %d: %s", rec.Code, rec.Body.String())
	}
	kept := storedJob(t, s, keptID)
	removed := storedJob(t, s, removedID)

	rec := httptest.NewRecorder()
	s.h.PutJobDocumentsHandler(rec, s.requestAsSession(http.MethodPut, "/api/v1/job-documents",
		models.JobWriteBatch{
			Jobs:      []models.JobWriteBody{{JobID: keptID, Revision: kept.MetaData.Revision, Document: loopDocumentNaming(t, "Merged")}},
			Deletes:   []models.JobDeleteBody{{JobID: removedID, Revision: removed.MetaData.Revision}},
			OneChange: true,
		}, s.account, s.handle, loopSaverTab, saver.ClientID))
	if rec.Code >= http.StatusBadRequest {
		t.Fatalf("the change was refused: %d — %s", rec.Code, rec.Body.String())
	}

	gone := wsclient.DocumentDeleteFor(eipmongo.CollectionJobDocuments, removedID)
	renamed := wsclient.DocumentUpdateFor(eipmongo.CollectionJobDocuments, keptID)
	for _, client := range []*wsclient.Client{second, third} {
		client.Await(t, loopWaitForSeen, gone)
		client.Await(t, loopWaitForSeen, renamed)
	}
	saver.Quiet(t, loopWaitForNone, gone)
	saver.Quiet(t, loopWaitForNone, renamed)
}

func nats(t *testing.T) *eipnats.NATS {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	conn, err := eipnats.Open(ctx)
	if err != nil {
		t.Skipf("the stack's NATS is unreachable: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

func awaitDeliveryReady(t *testing.T, s *plannerScope, planner loopPlanner, clients ...*wsclient.Client) {
	t.Helper()
	probeID := "eip-loop-probe-" + string(planner.owner.Kind)
	arrived := wsclient.DocumentUpdateFor(eipmongo.CollectionJobDocuments, probeID)
	waiting := append([]*wsclient.Client(nil), clients...)

	deadline := time.Now().Add(120 * time.Second)
	for len(waiting) > 0 && time.Now().Before(deadline) {
		probe := models.Job{JobID: probeID, Name: time.Now().Format(time.RFC3339Nano)}
		if rec := s.putJobs([]models.Job{probe}, s.account, planner.handle); rec.Code >= http.StatusBadRequest {
			t.Fatalf("probe write = %d: %s", rec.Code, rec.Body.String())
		}
		still := waiting[:0]
		for _, client := range waiting {
			if _, seen := client.Poll(time.Second, arrived); !seen {
				still = append(still, client)
			}
		}
		waiting = still
	}
	for _, client := range waiting {
		t.Fatalf("%s was never told about a probe in %s: it is not live or not subscribed",
			client.SessionID, planner.name)
	}
}

func (s *plannerScope) putWritesAsSession(writes []models.JobWriteBody, accountID, plannerHandle, sessionID, wsClientID string) *httptest.ResponseRecorder {
	s.t.Helper()
	rec := httptest.NewRecorder()
	s.h.PutJobDocumentsHandler(rec, s.requestAsSession(http.MethodPut, "/api/v1/job-documents",
		map[string]any{"jobs": writes}, accountID, plannerHandle, sessionID, wsClientID))
	return rec
}

func loopDocumentNaming(t *testing.T, name string) jsontext.Value {
	t.Helper()
	raw, err := jsoncodec.Marshal(map[string]any{"name": name})
	if err != nil {
		t.Fatalf("encode the write's document: %v", err)
	}
	return jsontext.Value(raw)
}

func recordLoopCapture(t *testing.T, s *plannerScope, jobID string, before models.Job, client *wsclient.Client) {
	t.Helper()
	dir := os.Getenv("EIP_CAPTURE_DIR")
	if dir == "" {
		return
	}

	path := filepath.Join(dir, "job-delta-capture.json")
	held := map[string]any{}
	if raw, err := os.ReadFile(path); err == nil {
		_ = jsoncodec.Unmarshal(raw, &held)
	}

	held[string(s.owner.Kind)] = map[string]any{
		"jobID":  jobID,
		"before": storedDocumentForCapture(t, s, before),
		"after":  storedDocumentForCapture(t, s, storedJob(t, s, jobID)),
		"frames": client.Frames(),
	}

	out, err := jsoncodec.Marshal(held)
	if err != nil {
		t.Fatalf("encode the capture: %v", err)
	}
	if err := os.WriteFile(path, append(out, '\n'), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func storedDocumentForCapture(t *testing.T, s *plannerScope, job models.Job) map[string]any {
	t.Helper()
	if err := jobidentity.Decrypt(&job, s.cipher); err != nil {
		t.Fatalf("decrypt the stored job: %v", err)
	}
	raw, err := jsoncodec.Marshal(job)
	if err != nil {
		t.Fatalf("encode the stored job: %v", err)
	}
	var out map[string]any
	if err := jsoncodec.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode the stored job: %v", err)
	}
	return out
}

func assertLoopDelta(t *testing.T, who string, frame map[string]any, wantRevision int64) {
	t.Helper()

	changes, ok := frame["changed"].([]any)
	if !ok || len(changes) == 0 {
		t.Fatalf("%s was sent no delta: %v", who, frame)
	}
	named := false
	for _, raw := range changes {
		change, _ := raw.(map[string]any)
		path, _ := change["path"].([]any)
		if len(path) == 1 && path[0] == "name" {
			named = true
			if change["value"] != "After the save" {
				t.Errorf("%s was sent name = %v, want the saved name", who, change["value"])
			}
		}
	}
	if !named {
		t.Errorf("%s was sent no change to the name: %v", who, changes)
	}
	if revision, _ := frame["revision"].(float64); int64(revision) != wantRevision {
		t.Errorf("%s was sent revision %v, want %d", who, frame["revision"], wantRevision)
	}
	if appliesTo, _ := frame["appliesTo"].(float64); int64(appliesTo) != wantRevision-1 {
		t.Errorf("%s was sent appliesTo %v, want %d", who, frame["appliesTo"], wantRevision-1)
	}
	if _, held := frame["document"]; !held {
		t.Errorf("%s was sent a delta with no document beside it", who)
	}
}
