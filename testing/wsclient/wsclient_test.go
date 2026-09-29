package wsclient

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	sessionreq "eve-industry-planner/shared/plannersession/request"

	"github.com/gorilla/websocket"
)

type failures struct {
	testing.TB
	failed []string
}

func (f *failures) Helper() {}

func (f *failures) Fatalf(format string, args ...any) {
	f.failed = append(f.failed, fmt.Sprintf(format, args...))
}

func serverThat(t *testing.T, then func(*websocket.Conn)) string {
	t.Helper()
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		_ = conn.WriteJSON(map[string]any{"type": "connected", "clientID": "client-1"})
		then(conn)
	}))
	t.Cleanup(srv.Close)
	return "ws" + strings.TrimPrefix(srv.URL, "http")
}

func nothing(frame map[string]any) bool { return frame["type"] == "never" }

func TestDialReadsTheClientIDTheServerAnsweredWith(t *testing.T) {
	client := Dial(t, serverThat(t, func(conn *websocket.Conn) { time.Sleep(time.Second) }), "sess-1", 5*time.Second)

	if client.ClientID != "client-1" {
		t.Errorf("want the connected frame's client id, got %q", client.ClientID)
	}
}

func TestAwaitFindsAFrameSentAfterConnectingAndKeepsIt(t *testing.T) {
	client := Dial(t, serverThat(t, func(conn *websocket.Conn) {
		_ = conn.WriteJSON(map[string]any{"collection": "job_documents", "docID": "job-1", "operationType": "update"})
		time.Sleep(time.Second)
	}), "sess-1", 5*time.Second)

	client.Await(t, 5*time.Second, DocumentUpdateFor("job_documents", "job-1"))

	if len(client.Frames()) != 2 {
		t.Errorf("want the connected frame and the update kept, got %v", client.Frames())
	}
}

func TestDocumentUpdateForIgnoresTheInsertThatCreatedTheDocument(t *testing.T) {
	match := DocumentUpdateFor("job_documents", "job-1")

	if match(map[string]any{"collection": "job_documents", "docID": "job-1", "operationType": "insert"}) {
		t.Error("want an insert passed over")
	}
	if !match(map[string]any{"collection": "job_documents", "docID": "job-1", "operationType": "update"}) {
		t.Error("want the update matched")
	}
}

func TestQuietPassesForAnOpenConnectionThatIsToldNothing(t *testing.T) {
	client := Dial(t, serverThat(t, func(conn *websocket.Conn) { time.Sleep(2 * time.Second) }), "sess-1", 5*time.Second)
	record := &failures{TB: t}

	client.Quiet(record, 300*time.Millisecond, nothing)

	if len(record.failed) != 0 {
		t.Errorf("want silence on an open connection accepted, got %v", record.failed)
	}
}

func TestQuietFailsWhenTheConnectionClosedRatherThanStayingSilent(t *testing.T) {
	client := Dial(t, serverThat(t, func(conn *websocket.Conn) { _ = conn.Close() }), "sess-1", 5*time.Second)
	record := &failures{TB: t}

	client.Quiet(record, time.Second, nothing)

	if len(record.failed) == 0 {
		t.Error("want a closed connection's silence refused as proof")
	}
}

func TestURLForSessionNamesTheSessionTheConnectionIsFor(t *testing.T) {
	target, err := URLForSession("ws://router:8080/ws", "sess-1")
	if err != nil {
		t.Fatalf("URLForSession: %v", err)
	}
	parsed, err := url.Parse(target)
	if err != nil {
		t.Fatalf("parse %s: %v", target, err)
	}
	if parsed.Query().Get(sessionreq.SessionIDQueryParam) != "sess-1" || parsed.Path != "/ws" {
		t.Errorf("want the session on the websocket path's query, got %s", target)
	}
}
