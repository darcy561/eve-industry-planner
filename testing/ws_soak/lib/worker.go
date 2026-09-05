package soaklib

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	apihelperauth "eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/wsplacement"

	"github.com/gorilla/websocket"
)

type soakConfig struct {
	WSURL       string
	Insecure    bool
	Reconnect   bool
	ReadIdle    time.Duration // optional read deadline; 0 = none (preferred for holds)
	DialTimeout time.Duration
	// DocRecv is optional; called for ChangeStream-shaped doc updates (non-blocking).
	DocRecv func(docID, accountID string)
	// Live is optional membership registry (fanout ready-settle).
	Live        *liveRegistry
	ReadySettle time.Duration
}

func wsURLForSession(base, sessionID string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(base))
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set(apihelperauth.PlannerSessionIDQueryParam, sessionID)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func dialHeaders(id clientIdentity, sticky string) http.Header {
	h := http.Header{}
	var cookies []string
	if id.Affinity != "" {
		cookies = append(cookies, wsplacement.AffinityCookie+"="+id.Affinity)
	}
	if sticky != "" {
		cookies = append(cookies, wsplacement.StickyCookie+"="+sticky)
	}
	if len(cookies) > 0 {
		h.Set("Cookie", strings.Join(cookies, "; "))
	}
	return h
}

func stickyFromResponse(resp *http.Response) string {
	if resp == nil {
		return ""
	}
	for _, c := range resp.Cookies() {
		if c.Name == wsplacement.StickyCookie {
			return strings.TrimSpace(c.Value)
		}
	}
	return ""
}

type dialResult struct {
	Conn   *websocket.Conn
	Resp   *http.Response
	Sticky string
	Status int
	Body   string
	Err    error
}

func dialOnce(cfg soakConfig, id clientIdentity, sticky string) dialResult {
	target, err := wsURLForSession(cfg.WSURL, id.SessionID)
	if err != nil {
		return dialResult{Err: err}
	}
	dialer := websocket.Dialer{
		HandshakeTimeout: cfg.DialTimeout,
		TLSClientConfig:  &tls.Config{InsecureSkipVerify: cfg.Insecure}, //nolint:gosec // local soak only
	}
	conn, resp, err := dialer.Dial(target, dialHeaders(id, sticky))
	out := dialResult{Conn: conn, Resp: resp, Err: err}
	if resp != nil {
		out.Status = resp.StatusCode
		out.Sticky = stickyFromResponse(resp)
		if err != nil {
			buf, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
			out.Body = string(buf)
			_ = resp.Body.Close()
		}
	}
	return out
}

func awaitConnected(conn *websocket.Conn, timeout time.Duration) (containerID string, err error) {
	_ = conn.SetReadDeadline(time.Now().Add(timeout))
	_, raw, err := conn.ReadMessage()
	if err != nil {
		return "", err
	}
	var msg map[string]any
	if err := json.Unmarshal(raw, &msg); err != nil {
		return "", fmt.Errorf("connected json: %w", err)
	}
	if got, _ := msg["type"].(string); got != "connected" {
		return "", fmt.Errorf("want type=connected got %v", msg["type"])
	}
	if cid, _ := msg["container_id"].(string); strings.TrimSpace(cid) != "" {
		return strings.TrimSpace(cid), nil
	}
	return "", nil
}

// runWorker holds one /ws connection until ctx is done, reconnecting when enabled.
func runWorker(ctx context.Context, cfg soakConfig, id clientIdentity, st *stats) {
	sticky := ""
	first := true
	for {
		if ctx.Err() != nil {
			return
		}
		if !first {
			st.ReconnectAttempt.Add(1)
		}
		res := dialOnce(cfg, id, sticky)
		if res.Err != nil {
			if res.Status > 0 {
				st.incRefuse(res.Status)
			} else {
				st.DialErr.Add(1)
			}
			if !cfg.Reconnect {
				return
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(500 * time.Millisecond):
			}
			continue
		}
		st.DialOK.Add(1)
		if res.Sticky != "" {
			sticky = res.Sticky
			st.incSlot(sticky)
		}
		containerID, err := awaitConnected(res.Conn, 5*time.Second)
		if err != nil {
			st.CloseUnexpected.Add(1)
			_ = res.Conn.Close()
			if !cfg.Reconnect {
				return
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(200 * time.Millisecond):
			}
			first = false
			continue
		}
		st.ConnectedOK.Add(1)
		if !first {
			st.ReconnectOK.Add(1)
		}
		first = false
		// Prefer connected.container_id (place path); sticky is fallback only.
		home := containerID
		if home == "" {
			home = sticky
		}
		if home != "" && id.Affinity != "" {
			st.recordAffinityPlace(id.Cohort, id.Affinity, home)
		} else if home != "" {
			st.incSlot(home)
		}

		if needsScopeUpgrade(id) {
			if err := upgradeScopes(res.Conn, id, 5*time.Second); err != nil {
				st.ScopesFail.Add(1)
				st.CloseUnexpected.Add(1)
				_ = res.Conn.Close()
				if !cfg.Reconnect {
					return
				}
				select {
				case <-ctx.Done():
					return
				case <-time.After(200 * time.Millisecond):
				}
				continue
			}
			st.ScopesOK.Add(1)
		}

		if cfg.Live != nil {
			cfg.Live.MarkLive(id)
			cfg.Live.ScheduleReady(id.AccountID)
		}

		st.live.Add(1)

		closedReason := holdConn(ctx, res.Conn, cfg.ReadIdle, st, id.AccountID, cfg.DocRecv)
		st.live.Add(-1)
		if cfg.Live != nil {
			cfg.Live.Unregister(id.AccountID)
		}
		_ = res.Conn.Close()

		if closedReason == "done" || ctx.Err() != nil {
			return
		}
		if closedReason == "please_reconnect" {
			// expected during drain / evacuate — reconnect
		} else {
			st.CloseUnexpected.Add(1)
		}
		if !cfg.Reconnect {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(100 * time.Millisecond):
		}
	}
}

func needsScopeUpgrade(id clientIdentity) bool {
	return id.CorpID != 0 || id.AllianceID != 0
}

// upgradeScopes sends upgrade_scopes and waits for scopes_ack (org pool + HostedTenants).
func upgradeScopes(conn *websocket.Conn, id clientIdentity, timeout time.Duration) error {
	var corpIDs, allianceIDs []string
	if id.CorpID != 0 {
		corpIDs = []string{fmt.Sprintf("%d", id.CorpID)}
	}
	if id.AllianceID != 0 {
		allianceIDs = []string{fmt.Sprintf("%d", id.AllianceID)}
	}
	payload, err := json.Marshal(map[string]any{
		"type":           "upgrade_scopes",
		"corporationIDs": corpIDs,
		"allianceIDs":    allianceIDs,
	})
	if err != nil {
		return err
	}
	_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
		return fmt.Errorf("upgrade_scopes write: %w", err)
	}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		_ = conn.SetReadDeadline(deadline)
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("upgrade_scopes read: %w", err)
		}
		if string(raw) == "pong" || string(raw) == "ping" {
			continue
		}
		var msg map[string]any
		if json.Unmarshal(raw, &msg) != nil {
			continue
		}
		if got, _ := msg["type"].(string); got != "scopes_ack" {
			continue
		}
		if ok, _ := msg["ok"].(bool); !ok {
			return fmt.Errorf("scopes_ack not ok: %v", msg)
		}
		return nil
	}
	return fmt.Errorf("timeout waiting scopes_ack")
}

// App text heartbeat — same interval/payload as frontend realtimeClient.js.
// Written from a side goroutine; gorilla allows WriteMessage concurrent with the
// default PingHandler's WriteControl pongs. Do not drive pings off read deadlines
// (ReadMessage errors are permanent in gorilla).
const appPingPeriod = 45 * time.Second

// holdConn reads until please_reconnect, socket error, or ctx done.
// Returns "please_reconnect", "close", or "done" (soak cancelled).
func holdConn(ctx context.Context, conn *websocket.Conn, readIdle time.Duration, st *stats, accountID string, docRecv func(docID, accountID string)) (reason string) {
	defer func() {
		if recover() != nil {
			reason = "close"
		}
	}()
	if readIdle > 0 {
		_ = conn.SetReadDeadline(time.Now().Add(readIdle))
	} else {
		_ = conn.SetReadDeadline(time.Time{})
	}
	readDone := make(chan struct{})
	defer close(readDone)
	go func() {
		select {
		case <-ctx.Done():
			_ = conn.Close()
		case <-readDone:
		}
	}()
	go func() {
		t := time.NewTicker(appPingPeriod)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-readDone:
				return
			case <-t.C:
				_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
				if err := conn.WriteMessage(websocket.TextMessage, []byte("ping")); err != nil {
					return
				}
			}
		}
	}()
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			if ctx.Err() != nil {
				return "done"
			}
			return "close"
		}
		if readIdle > 0 {
			_ = conn.SetReadDeadline(time.Now().Add(readIdle))
		}
		if bytesEqASCII(raw, "pong") || bytesEqASCII(raw, "ping") {
			continue
		}
		// Cheap field extract — avoid map[string]any on every fan-in frame.
		if extractJSONStringField(raw, "type") == "please_reconnect" {
			st.PleaseReconnect.Add(1)
			return "please_reconnect"
		}
		if docRecv != nil {
			if docID := strings.TrimSpace(extractJSONStringField(raw, "docID")); docID != "" {
				docRecv(docID, accountID)
			}
		}
	}
}
