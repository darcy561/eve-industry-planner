// Package wsclient opens a real websocket connection for a live test, the way a
// browser tab does, and reads the frames the stack sends it.
package wsclient

import (
	"encoding/json"
	"net/url"
	"strings"
	"testing"
	"time"

	sessionreq "eve-industry-planner/shared/plannersession/request"

	"github.com/gorilla/websocket"
)

const framesHeld = 4096

// Client is one connected tab: a session, and the frames it has been sent,
// drained from the socket by a goroutine from the moment it opens.
type Client struct {
	SessionID string
	ClientID  string

	conn    *websocket.Conn
	arrived chan map[string]any
	closed  chan struct{}
	seen    []map[string]any
}

// Dial connects as one tab of a session and waits for the frame the server
// answers a new connection with.
func Dial(t testing.TB, baseURL, sessionID string, within time.Duration) *Client {
	t.Helper()

	target, err := URLForSession(baseURL, sessionID)
	if err != nil {
		t.Fatalf("websocket url for %s: %v", sessionID, err)
	}

	dialer := websocket.Dialer{HandshakeTimeout: within}
	conn, resp, err := dialer.Dial(target, nil)
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
			_ = resp.Body.Close()
		}
		t.Skipf("websocket unreachable at %s (status %d): %v", baseURL, status, err)
	}
	if resp != nil {
		_ = resp.Body.Close()
	}

	client := &Client{
		SessionID: sessionID,
		conn:      conn,
		arrived:   make(chan map[string]any, framesHeld),
		closed:    make(chan struct{}),
	}
	t.Cleanup(func() { _ = conn.Close() })
	go client.drain()

	connected := client.Await(t, within, func(frame map[string]any) bool {
		return asString(frame["type"]) == "connected"
	})
	client.ClientID = asString(connected["clientID"])
	return client
}

// WorkIn names the planner this connection receives changes for, which it
// receives none of until it asks and which replaces whatever it named before.
func (c *Client) WorkIn(t testing.TB, ownerHandle string) {
	t.Helper()
	frame, err := json.Marshal(map[string]any{
		"type":  "active_planner",
		"owner": ownerHandle,
	})
	if err != nil {
		t.Fatalf("encode active_planner: %v", err)
	}
	if err := c.conn.WriteMessage(websocket.TextMessage, frame); err != nil {
		t.Fatalf("%s could not name its planner: %v", c.SessionID, err)
	}
}

// Await returns the first frame this client is sent that the predicate accepts,
// failing the test if none arrives in time.
func (c *Client) Await(t testing.TB, within time.Duration, match func(map[string]any) bool) map[string]any {
	t.Helper()
	if frame, ok := c.Poll(within, match); ok {
		return frame
	}
	t.Fatalf("%s was sent no matching frame within %s (saw %d)", c.SessionID, within, len(c.seen))
	return nil
}

// Poll answers the first frame the predicate accepts, or false, without failing
// the test — for waiting on something that may not have started yet.
func (c *Client) Poll(within time.Duration, match func(map[string]any) bool) (map[string]any, bool) {
	for _, frame := range c.seen {
		if match(frame) {
			return frame, true
		}
	}

	deadline := time.After(within)
	for {
		select {
		case frame, open := <-c.arrived:
			if !open {
				return nil, false
			}
			c.seen = append(c.seen, frame)
			if match(frame) {
				return frame, true
			}
		case <-deadline:
			return nil, false
		}
	}
}

// Quiet fails the test if a frame the predicate accepts arrives, or if the
// connection closed, since a closed one is silent whatever it would have been sent.
func (c *Client) Quiet(t testing.TB, within time.Duration, match func(map[string]any) bool) {
	t.Helper()
	if frame, ok := c.Poll(within, match); ok {
		t.Fatalf("%s was sent a frame it should not have been: %v", c.SessionID, frame)
	}
	select {
	case <-c.closed:
		t.Fatalf("%s's connection closed, so its silence proves nothing", c.SessionID)
	default:
	}
}

// Frames is every frame this client has taken off the socket so far.
func (c *Client) Frames() []map[string]any {
	return append([]map[string]any(nil), c.seen...)
}

func (c *Client) drain() {
	defer close(c.closed)
	defer close(c.arrived)
	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var frame map[string]any
		if json.Unmarshal(raw, &frame) != nil {
			continue
		}
		select {
		case c.arrived <- frame:
		default:
			return
		}
	}
}

// URLForSession names the session a connection is opened for, which is how every
// caller of the websocket says who it is.
func URLForSession(base, sessionID string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(base))
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set(sessionreq.SessionIDQueryParam, sessionID)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func asString(value any) string {
	held, _ := value.(string)
	return held
}

// DocumentUpdateFor matches the frame announcing one document's update, not the insert that
// created it.
func DocumentUpdateFor(collection, docID string) func(map[string]any) bool {
	return documentFrameFor(collection, docID, "update")
}

// DocumentDeleteFor matches the frame announcing one document's removal.
func DocumentDeleteFor(collection, docID string) func(map[string]any) bool {
	return documentFrameFor(collection, docID, "delete")
}

func documentFrameFor(collection, docID, operation string) func(map[string]any) bool {
	return func(frame map[string]any) bool {
		return asString(frame["collection"]) == collection &&
			asString(frame["docID"]) == docID &&
			asString(frame["operationType"]) == operation
	}
}
