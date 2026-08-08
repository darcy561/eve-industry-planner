package server

// Integration suite SoT for the websocket server package.
// All Integration scenarios use newIntegFixture — do not call newServer bits directly
// from scenario files. Grow via thin integration_*_test.go cases + helpers below.
//
// Run (from services/):
//
//	go test ./websocket/server/ -count=1 -run Integration

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	apihelperauth "eve-industry-planner/api/helper/auth"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/orchestrationprobes"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/shared/wsplacement"
	"eve-industry-planner/websocket/server/model"

	"github.com/alicebob/miniredis/v2"
	"github.com/alitto/pond/v2"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

// integDeps stands in for NATS/Mongo in the ReadyCheck mirror of websocket/app.go.
type integDeps struct {
	natsOK  bool
	mongoOK bool
}

// integFixture is the single harness for Integration tests.
type integFixture struct {
	t      *testing.T
	Server *Server
	Redis  *redis.Client
	MR     *miniredis.Miniredis
	HTTP   *httptest.Server
	deps   integDeps
}

// newIntegFixture builds Server + miniredis + httptest (/ws, /ready, /healthy).
// This is the only entry point Integration scenarios should use.
//
// Env defaults (single SoT — do not re-Setenv in scenarios unless overriding):
//
//	HOSTNAME = websocket-integ:<t.Name()>
//	WS_CLIENT_CUTOFF    = 0  (unlimited)
//	WS_TARGET_CLIENTS   = 0  (soft off)
//
// Override limits with setPlacementLimits after the fixture is built.
func newIntegFixture(t *testing.T) *integFixture {
	t.Helper()
	t.Setenv("HOSTNAME", "websocket-integ:"+t.Name())
	t.Setenv("WS_CLIENT_CUTOFF", "0")
	t.Setenv("WS_TARGET_CLIENTS", "0")

	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	s := &Server{
		Clients:                make(map[string]*Client),
		userConnections:        make(map[string]map[string]bool),
		sessionHandoffs:        make(map[string]*sessionHandoffEntry),
		activeSubscriptions:    make(map[string]map[string]time.Time),
		incomingQueues:         make(map[string]*IncomingDocQueue),
		explicitDocSubscribers: make(map[string]map[string]bool),
		corpToClients:          make(map[string]map[string]bool),
		allianceToClients:      make(map[string]map[string]bool),
		Stack:                  &stackservices.Clients{Redis: rdb},
		SyncPool:               pond.NewPool(1),
		upgrader:               upgrader,
		intakeStopChan:         make(chan struct{}),
		shutdownChan:           make(chan struct{}),
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		s.Shutdown(ctx)
	})

	f := &integFixture{
		t:      t,
		Server: s,
		Redis:  rdb,
		MR:     mr,
		deps:   integDeps{natsOK: true, mongoOK: true},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.HandleWS)
	mux.HandleFunc("/ws/", s.HandleWS)
	mux.HandleFunc(wsplacement.StatusPath, s.HandlePlacement)
	mux.HandleFunc("/ready", orchestrationprobes.ReadyHandler(f.readyCheck))
	mux.HandleFunc("/healthy", orchestrationprobes.HealthyHandler)
	f.HTTP = httptest.NewServer(mux)
	t.Cleanup(f.HTTP.Close)
	return f
}

// readyCheck mirrors websocket/app.go Ready (draining + redis + nats + mongo),
// with NATS/Mongo as injectable flags so CI stays Docker-free.
func (f *integFixture) readyCheck(ctx context.Context) error {
	if f.Server != nil && f.Server.IsDraining() {
		return fmt.Errorf("draining")
	}
	if f.Redis == nil {
		return fmt.Errorf("redis: unavailable")
	}
	if err := f.Redis.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("redis: %w", err)
	}
	if !f.deps.natsOK {
		return fmt.Errorf("nats not connected")
	}
	if !f.deps.mongoOK {
		return fmt.Errorf("mongo: unavailable")
	}
	return nil
}

func (f *integFixture) setDeps(natsOK, mongoOK bool) {
	f.deps.natsOK = natsOK
	f.deps.mongoOK = mongoOK
}

// setPlacementLimits overrides the fixture defaults for soft target / hard cutoff.
// Config reads these env vars at call time, so this is safe after newIntegFixture.
func (f *integFixture) setPlacementLimits(targetClients, clientCutoff int) {
	f.t.Helper()
	f.t.Setenv("WS_TARGET_CLIENTS", strconv.Itoa(targetClients))
	f.t.Setenv("WS_CLIENT_CUTOFF", strconv.Itoa(clientCutoff))
}

func (f *integFixture) seedSession(accountID, sessionID string) {
	f.t.Helper()
	now := time.Now().UTC()
	if err := apihelperauth.UpsertAccountSession(context.Background(), f.Redis, accountID, apihelperauth.AccountSession{
		SessionID:        sessionID,
		CharacterHash:    "integ-hash",
		StartedAt:        now,
		LastSeenAt:       now,
		ReauthRequiredAt: apihelperauth.ReauthDeadlineFromSessionStart(now),
	}); err != nil {
		f.t.Fatalf("seedSession: %v", err)
	}
}

func (f *integFixture) seedSessionWithGrants(accountID, sessionID string, corps, alliances []int64) {
	f.t.Helper()
	f.seedSession(accountID, sessionID)
	if err := apihelperauth.UpdateAccountSessionGrants(context.Background(), f.Redis, accountID, corps, alliances); err != nil {
		f.t.Fatalf("seedSession grants: %v", err)
	}
}

func (f *integFixture) wsURL(sessionID string) string {
	base := "ws" + strings.TrimPrefix(f.HTTP.URL, "http")
	return base + "/ws?" + apihelperauth.PlannerSessionIDQueryParam + "=" + sessionID
}

func (f *integFixture) dial(sessionID string) *websocket.Conn {
	f.t.Helper()
	conn, resp, err := websocket.DefaultDialer.Dial(f.wsURL(sessionID), nil)
	if err != nil {
		status := 0
		body := ""
		if resp != nil {
			status = resp.StatusCode
			buf := make([]byte, 256)
			n, _ := resp.Body.Read(buf)
			body = string(buf[:n])
			_ = resp.Body.Close()
		}
		f.t.Fatalf("dial: %v status=%d body=%q", err, status, body)
	}
	f.t.Cleanup(func() { _ = conn.Close() })
	return conn
}

func (f *integFixture) dialRefuse(sessionID string) (status int, body string) {
	f.t.Helper()
	conn, resp, err := websocket.DefaultDialer.Dial(f.wsURL(sessionID), nil)
	if err == nil {
		_ = conn.Close()
		f.t.Fatal("expected dial to fail")
	}
	if resp == nil {
		f.t.Fatalf("dial failed without HTTP response: %v", err)
	}
	defer resp.Body.Close()
	buf := make([]byte, 512)
	n, _ := resp.Body.Read(buf)
	return resp.StatusCode, string(buf[:n])
}

func (f *integFixture) get(path string) (status int, body string) {
	f.t.Helper()
	resp, err := http.Get(f.HTTP.URL + path)
	if err != nil {
		f.t.Fatalf("GET %s: %v", path, err)
	}
	defer resp.Body.Close()
	buf := make([]byte, 256)
	n, _ := resp.Body.Read(buf)
	return resp.StatusCode, string(buf[:n])
}

func (f *integFixture) waitClients(want int, timeout time.Duration) {
	f.t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if f.Server.ConnectedCount() == want {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	f.t.Fatalf("ConnectedCount=%d want %d", f.Server.ConnectedCount(), want)
}

func (f *integFixture) readJSONMessage(conn *websocket.Conn, timeout time.Duration) map[string]any {
	f.t.Helper()
	_ = conn.SetReadDeadline(time.Now().Add(timeout))
	_, raw, err := conn.ReadMessage()
	if err != nil {
		f.t.Fatalf("ReadMessage: %v", err)
	}
	var msg map[string]any
	if err := json.Unmarshal(raw, &msg); err != nil {
		f.t.Fatalf("json: %v raw=%q", err, raw)
	}
	return msg
}

// connectAccount seeds a session, dials /ws, and drains the connected frame.
func (f *integFixture) connectAccount(accountID, sessionID string) *websocket.Conn {
	f.t.Helper()
	f.seedSession(accountID, sessionID)
	conn := f.dial(sessionID)
	msg := f.readJSONMessage(conn, 2*time.Second)
	if got, _ := msg["type"].(string); got != "connected" {
		f.t.Fatalf("want connected, got %v", msg)
	}
	f.waitClients(1, 2*time.Second)
	return conn
}

func (f *integFixture) writeJSON(conn *websocket.Conn, payload any) {
	f.t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		f.t.Fatalf("marshal: %v", err)
	}
	_ = conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	if err := conn.WriteMessage(websocket.TextMessage, raw); err != nil {
		f.t.Fatalf("WriteMessage: %v", err)
	}
}

func (f *integFixture) readJSONOfType(conn *websocket.Conn, wantType string, timeout time.Duration) map[string]any {
	f.t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		msg := f.readJSONMessage(conn, time.Until(deadline))
		if got, _ := msg["type"].(string); got == wantType {
			return msg
		}
	}
	f.t.Fatalf("timed out waiting for type=%q", wantType)
	return nil
}

func (f *integFixture) redisGet(key string) (string, error) {
	return f.Redis.Get(context.Background(), key).Result()
}

func (f *integFixture) redisExists(key string) int64 {
	f.t.Helper()
	n, err := f.Redis.Exists(context.Background(), key).Result()
	if err != nil {
		f.t.Fatalf("Exists %s: %v", key, err)
	}
	return n
}

func (f *integFixture) requireRedisValue(key, want string) {
	f.t.Helper()
	got, err := f.redisGet(key)
	if err != nil || got != want {
		f.t.Fatalf("redis %s: got %q err=%v want %q", key, got, err, want)
	}
}

func (f *integFixture) requireRedisAbsent(key string) {
	f.t.Helper()
	if n := f.redisExists(key); n != 0 {
		f.t.Fatalf("redis %s: exists=%d want 0", key, n)
	}
}

func (f *integFixture) waitRedisExists(key string, timeout time.Duration) {
	f.t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if f.redisExists(key) > 0 {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	f.t.Fatalf("redis key absent after wait: %s", key)
}

func (f *integFixture) waitRedisAbsent(key string, timeout time.Duration) {
	f.t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if f.redisExists(key) == 0 {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	f.t.Fatalf("redis key still present: %s", key)
}

// --- in-process client / placement helpers (no second Server construction) ---

func (f *integFixture) newClient(id, accountID string, corps, alliances []string) *Client {
	return &Client{
		id:                 id,
		AccountID:          accountID,
		Send:               make(chan []byte, 8),
		Scopes:             model.RealtimeScopes{},
		grantedCorpIDs:     stringSetFromSlice(corps),
		grantedAllianceIDs: stringSetFromSlice(alliances),
	}
}

func (f *integFixture) register(c *Client) {
	f.t.Helper()
	s := f.Server
	s.ClientsMu.Lock()
	s.Clients[c.id] = c
	s.ClientsMu.Unlock()
	s.userConnMu.Lock()
	if s.userConnections[c.AccountID] == nil {
		s.userConnections[c.AccountID] = make(map[string]bool)
	}
	s.userConnections[c.AccountID][c.id] = true
	s.userConnMu.Unlock()
}

func (f *integFixture) unregister(c *Client) {
	f.t.Helper()
	s := f.Server
	s.unregisterClientFromOrgPools(c)
	s.ClientsMu.Lock()
	delete(s.Clients, c.id)
	s.ClientsMu.Unlock()
	s.userConnMu.Lock()
	if m := s.userConnections[c.AccountID]; m != nil {
		delete(m, c.id)
		if len(m) == 0 {
			delete(s.userConnections, c.AccountID)
		}
	}
	s.userConnMu.Unlock()
}

func (f *integFixture) setOrgScopes(c *Client, corps, alliances []string) {
	f.t.Helper()
	f.Server.swapClientOrgScopesAndIndexes(c, model.RealtimeScopes{
		CorporationIDs: corps,
		AllianceIDs:    alliances,
	})
}

func (f *integFixture) syncPlacementHints() {
	f.t.Helper()
	n := f.Server.ConnectedCount()
	f.Server.syncPlacementFlags(context.Background(), n)
}

func (f *integFixture) placementStatus() natscore.PlacementState {
	f.t.Helper()
	res, err := http.Get(f.HTTP.URL + wsplacement.StatusPath)
	if err != nil {
		f.t.Fatalf("GET placement: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		f.t.Fatalf("placement status=%d", res.StatusCode)
	}
	var st natscore.PlacementState
	if err := json.NewDecoder(res.Body).Decode(&st); err != nil {
		f.t.Fatalf("decode placement: %v", err)
	}
	return st
}

func (f *integFixture) requirePlacement(soft, full bool, clients int) {
	f.t.Helper()
	st := f.placementStatus()
	if st.Soft != soft || st.Full != full || st.Clients != clients {
		f.t.Fatalf("placement soft=%v full=%v clients=%d want soft=%v full=%v clients=%d",
			st.Soft, st.Full, st.Clients, soft, full, clients)
	}
}
