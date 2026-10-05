package jobdocuments

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"encoding/json/jsontext"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/core/changestream"
	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"
	"eve-industry-planner/testing/plannersessions"
	"eve-industry-planner/testing/wsclient"
)

const (
	conflictEditorTab    = "eip-conflict-editor-tab"
	conflictMemberTab    = "eip-conflict-member-tab"
	conflictBystanderTab = "eip-conflict-bystander-tab"
	conflictJobID        = "eip-conflict-job"
)

func updateAtRevision(jobID string, revision int64) func(map[string]any) bool {
	isUpdate := wsclient.DocumentUpdateFor(eipmongo.CollectionJobDocuments, jobID)
	return func(frame map[string]any) bool {
		got, _ := frame["revision"].(float64)
		return isUpdate(frame) && int64(got) == revision
	}
}

func (s *plannerScope) sendAs(t *testing.T, method, path string, body any, sessionID, wsClientID string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	r := s.requestAsSession(method, path, body, s.account, s.handle, sessionID, wsClientID)
	switch method {
	case http.MethodPut:
		s.h.PutJobDocumentsHandler(rec, r)
	case http.MethodPost:
		s.h.GetJobDocumentsByIDsHandler(rec, r)
	default:
		t.Fatalf("no handler for %s", method)
	}
	return rec
}

func responseBody(t *testing.T, rec *httptest.ResponseRecorder) any {
	t.Helper()
	if rec.Body.Len() == 0 {
		return nil
	}
	var parsed any
	if err := jsoncodec.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("decode the response: %v — %s", err, rec.Body.String())
	}
	return parsed
}

func TestLive_ConflictLoop_aSaveFromAnotherTabMeetsAnOpenEditorAndItsRefusedClose(t *testing.T) {
	s := newPlannerScope(t)
	if os.Getenv(entityid.EnvKey) == "" {
		t.Skipf("a corporation planner's handle needs the stack's %s to be one the websocket accepts",
			entityid.EnvKey)
	}
	redis := stackRedis(t)
	granted := models.NewOwnerKeys().Add(s.owner)
	for _, session := range []string{conflictEditorTab, conflictMemberTab, conflictBystanderTab} {
		plannersessions.Open(t, redis, s.account, session, granted)
	}
	watcher := changestream.NewWatcher(
		mongolive.RequireWatch(t, len(changestream.CollectionGroups())), nats(t), nil)
	t.Cleanup(watcher.Start(changestream.CollectionGroups()))

	seed := models.Job{
		JobID: conflictJobID, Name: "Before either save", ItemID: 587,
		Build: models.JobBuild{
			ExtrasCosts: map[string]models.ExtraCost{
				"e-1": {ID: "e-1", ExtraText: "Courier", ExtraValue: 120000},
			},
		},
	}
	if rec := s.putJobs([]models.Job{seed}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("seed write = %d: %s", rec.Code, rec.Body.String())
	}
	before := storedJob(t, s, conflictJobID)
	read := before.MetaData.Revision

	url := loopWebsocketURL()
	editor := wsclient.Dial(t, url, conflictEditorTab, 15*time.Second)
	member := wsclient.Dial(t, url, conflictMemberTab, 15*time.Second)
	bystander := wsclient.Dial(t, url, conflictBystanderTab, 15*time.Second)
	for _, client := range []*wsclient.Client{editor, member, bystander} {
		client.WorkIn(t, s.handle)
	}
	awaitDeliveryReady(t, s, loopPlanner{name: "the corporation planner", owner: s.owner, handle: s.handle},
		editor, member, bystander)

	incomingWrite := models.JobWriteBody{
		JobID:    conflictJobID,
		Revision: read,
		Document: loopDocumentNaming(t, "Named by the incoming save"),
		Removed:  [][]string{{"build", "extrasCosts", "e-1"}},
	}
	if rec := s.putWritesAsSession([]models.JobWriteBody{incomingWrite},
		s.account, s.handle, conflictMemberTab, member.ClientID); rec.Code >= http.StatusBadRequest {
		t.Fatalf("the other member's save was refused: %d — %s", rec.Code, rec.Body.String())
	}
	editor.Await(t, loopWaitForSeen, updateAtRevision(conflictJobID, read+1))
	bystander.Await(t, loopWaitForSeen, updateAtRevision(conflictJobID, read+1))
	member.Quiet(t, loopWaitForNone, updateAtRevision(conflictJobID, read+1))
	afterIncoming := storedJob(t, s, conflictJobID)

	staleChange := models.JobWriteBatch{OneChange: true, Jobs: []models.JobWriteBody{{
		JobID: conflictJobID, Revision: read, Document: loopDocumentNaming(t, "Named by the editor"),
	}}}
	refused := s.sendAs(t, http.MethodPut, "/api/v1/job-documents", staleChange, conflictEditorTab, editor.ClientID)
	if refused.Code != http.StatusConflict {
		t.Fatalf("the stale close = %d, want 409: %s", refused.Code, refused.Body.String())
	}
	conflict := decodeConflict(t, refused.Body.Bytes())
	if conflict.Error != helper.ErrCodeRevisionConflict || conflict.Saved != 0 ||
		len(conflict.Rejected) != 1 || conflict.Rejected[0].Current != read+1 {
		t.Fatalf("the stale close was answered %+v, want the job named at revision %d", conflict, read+1)
	}
	if got := storedJob(t, s, conflictJobID); got.MetaData.Revision != read+1 || got.Name != "Named by the incoming save" {
		t.Fatalf("the refused close wrote something: %q at %d", got.Name, got.MetaData.Revision)
	}

	reread := s.sendAs(t, http.MethodPost, "/api/v1/job-documents",
		map[string]any{"jobIDs": []string{conflictJobID}}, conflictEditorTab, editor.ClientID)
	if reread.Code != http.StatusOK {
		t.Fatalf("reading the job back = %d: %s", reread.Code, reread.Body.String())
	}

	keptChange := models.JobWriteBatch{OneChange: true, Jobs: []models.JobWriteBody{{
		JobID: conflictJobID, Revision: read + 1, Document: loopDocumentNaming(t, "Named by the editor"),
	}}}
	saved := s.sendAs(t, http.MethodPut, "/api/v1/job-documents", keptChange, conflictEditorTab, editor.ClientID)
	if saved.Code != http.StatusNoContent {
		t.Fatalf("saving again = %d, want 204: %s", saved.Code, saved.Body.String())
	}
	member.Await(t, loopWaitForSeen, updateAtRevision(conflictJobID, read+2))
	bystander.Await(t, loopWaitForSeen, updateAtRevision(conflictJobID, read+2))
	editor.Quiet(t, loopWaitForNone, updateAtRevision(conflictJobID, read+2))

	after := storedJob(t, s, conflictJobID)
	if after.Name != "Named by the editor" || after.MetaData.Revision != read+2 {
		t.Fatalf("stored %q at %d, want the editor's name at %d", after.Name, after.MetaData.Revision, read+2)
	}
	if _, kept := after.Build.ExtrasCosts["e-1"]; kept {
		t.Fatal("the editor's save brought back the row the incoming save removed")
	}

	recordConflictCapture(t, map[string]any{
		"jobID":         conflictJobID,
		"before":        storedDocumentForCapture(t, s, before),
		"afterIncoming": storedDocumentForCapture(t, s, afterIncoming),
		"after":         storedDocumentForCapture(t, s, after),
		"sent": map[string]any{
			"incoming": incomingWrite,
			"stale":    staleChange,
			"kept":     keptChange,
		},
		"answered": map[string]any{
			"stale":  map[string]any{"status": refused.Code, "body": responseBody(t, refused)},
			"reread": map[string]any{"status": reread.Code, "body": responseBody(t, reread)},
			"kept":   map[string]any{"status": saved.Code},
		},
		"frames": map[string]any{
			"editor":    editor.Frames(),
			"member":    member.Frames(),
			"bystander": bystander.Frames(),
		},
	})
}

func recordConflictCapture(t *testing.T, capture map[string]any) {
	t.Helper()
	dir := os.Getenv("EIP_CAPTURE_DIR")
	if dir == "" {
		return
	}
	out, err := jsoncodec.Marshal(capture)
	if err != nil {
		t.Fatalf("encode the capture: %v", err)
	}
	indented := jsontext.Value(out)
	if err := indented.Indent(); err != nil {
		t.Fatalf("indent the capture: %v", err)
	}
	path := filepath.Join(dir, "job-conflict-capture.json")
	if err := os.WriteFile(path, append(indented, '\n'), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
