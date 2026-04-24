//go:build throughput

package integration

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	mathrand "math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"eve-industry-planner/core/changestream"
	"eve-industry-planner/shared/core/internaljwt"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry"
	wsserver "eve-industry-planner/websocket/server"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// TestRealtimeThroughputMongoToWebSocket drives Mongo updates across several changestream collection groups,
// many accounts, churning WebSocket clients (random connect/disconnect), optional external WS URLs for replica fan-out,
// and prints throughput + latency samples.
//
// Load shape (message spikes & irregular traffic, not steady-state):
//   - Mongo writers ([THROUGHPUT_MONGO_WRITERS], default 8): each goroutine randomly chooses among (a) small
//     batches of 1–3 writes then long jittered sleep, (b) spikes of 80–799 back-to-back writes then short sleep,
//     (c) sustained medium bursts with sub-ms sleeps. Only ~6% of writes record latency timestamps (pending).
//   - WebSocket churn: periodic random delay (5–124ms), then dial up or disconnect to keep active sockets between
//     THROUGHPUT_WS_ACTIVE_MIN and MAX (random disconnect when above min ~48% of the time).
//
// Core env:
//
//	export RUN_THROUGHPUT_TEST=1
//	export THROUGHPUT_DURATION=5m
//	export THROUGHPUT_START_CHANGESTREAM=0   # when core publishes changestream
//	export THROUGHPUT_ACCOUNTS=1024          # synthetic account ids tpacc000000 … (default 1024, max 8192)
//	export THROUGHPUT_POOL_PER_ACCOUNT=64    # planner/archive doc ids per account (default 64)
//	export THROUGHPUT_WS_ACTIVE_MIN=800      # churn tries to stay above this many open sockets (default 800)
//	export THROUGHPUT_WS_ACTIVE_MAX=12000    # churn ceiling (default 12000)
//	export THROUGHPUT_WS_MAX_PER_ACCOUNT=768 # WS_MAX_CONNECTIONS_PER_USER (default 768)
//	export THROUGHPUT_WS_ENDPOINTS=          # comma-separated ws/http(s) URLs; overrides stack replicas below
//	export THROUGHPUT_WS_STACK_REPLICAS=0    # set to 2 (etc.) on Compose to dial ws://<project>-websocket-{1..N}:4001/ws (skips httptest)
//	export COMPOSE_PROJECT_NAME=eve-industry-planner   # container name prefix when using STACK_REPLICAS (must match docker compose)
//	When dialing real websocket containers, mount the same JWT volume as services (e.g. docker … -v eve-industry-planner_api_data:/data).
//	export THROUGHPUT_OTEL_METRICS=1
//
// Multi-replica / Traefik (same JWT as deploy; Traefik may round-robin when no sticky cookie):
//
//	export THROUGHPUT_WS_ENDPOINTS=ws://traefik/ws
//
//	go test -tags throughput ./integration -run TestRealtimeThroughputMongoToWebSocket -count=1 -timeout 400m
func TestRealtimeThroughputMongoToWebSocket(t *testing.T) {
	if os.Getenv("RUN_THROUGHPUT_TEST") != "1" {
		t.Skip("set RUN_THROUGHPUT_TEST=1 to run this 5-minute load test")
	}

	durStr := os.Getenv("THROUGHPUT_DURATION")
	if durStr == "" {
		durStr = "5m"
	}
	duration, err := time.ParseDuration(durStr)
	if err != nil {
		t.Fatalf("THROUGHPUT_DURATION: %v", err)
	}
	if duration < 5*time.Second {
		t.Fatalf("THROUGHPUT_DURATION too short (min 5s): %v", duration)
	}

	nAccounts := intFromEnvDefault(t, "THROUGHPUT_ACCOUNTS", 1024)
	if nAccounts < 1 {
		t.Fatalf("THROUGHPUT_ACCOUNTS must be >= 1")
	}
	if nAccounts > 8192 {
		t.Fatalf("THROUGHPUT_ACCOUNTS too high (max 8192): %d", nAccounts)
	}
	poolPerAcct := intFromEnvDefault(t, "THROUGHPUT_POOL_PER_ACCOUNT", 64)
	if poolPerAcct < 8 {
		t.Fatalf("THROUGHPUT_POOL_PER_ACCOUNT must be >= 8")
	}

	activeMin := intFromEnvDefault(t, "THROUGHPUT_WS_ACTIVE_MIN", 800)
	activeMax := intFromEnvDefault(t, "THROUGHPUT_WS_ACTIVE_MAX", 12000)
	if os.Getenv("THROUGHPUT_WS_ACTIVE_MAX") == "" && os.Getenv("THROUGHPUT_WS_CLIENTS") != "" {
		activeMax = intFromEnvDefault(t, "THROUGHPUT_WS_CLIENTS", activeMax)
	}
	if activeMin < 0 || activeMax < activeMin {
		t.Fatalf("invalid THROUGHPUT_WS_ACTIVE_MIN/MAX")
	}
	maxPerAccount := intFromEnvDefault(t, "THROUGHPUT_WS_MAX_PER_ACCOUNT", 768)
	if maxPerAccount < 1 {
		t.Fatalf("THROUGHPUT_WS_MAX_PER_ACCOUNT must be >= 1")
	}
	t.Setenv("WS_MAX_CONNECTIONS_PER_USER", strconv.Itoa(maxPerAccount))

	ctx, cancel := context.WithTimeout(context.Background(), duration+5*time.Minute)
	defer cancel()

	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo, shared.ServiceNATS, shared.ServiceRedis)
	if err != nil {
		t.Fatalf("connect services: %v", err)
	}
	defer func() {
		shutdownCtx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		for _, fn := range clients.CleanupFns {
			fn(shutdownCtx)
		}
	}()

	startWatcher := os.Getenv("THROUGHPUT_START_CHANGESTREAM") != "0"
	var stopChangestream func()
	if startWatcher {
		var cerr error
		stopChangestream, cerr = changestream.StartService(clients.Mongo, clients.JetStream, clients.NATS)
		if cerr != nil {
			t.Fatalf("changestream: %v", cerr)
		}
		defer stopChangestream()
		t.Log("started in-process changestream watcher (set THROUGHPUT_START_CHANGESTREAM=0 if core is also running)")
	} else {
		t.Log("THROUGHPUT_START_CHANGESTREAM=0: assuming another process publishes changestream → NATS")
	}

	var teleShutdown func(context.Context) error
	if throughputOTelMetricsWant() {
		ep := throughputOTLPEndpoint()
		exportEvery := telemetry.DefaultMetricExportInterval
		if v := strings.TrimSpace(os.Getenv("THROUGHPUT_METRIC_EXPORT_INTERVAL")); v != "" {
			if d, err := time.ParseDuration(v); err == nil && d > 0 {
				exportEvery = d
			}
		}
		teleCfg := telemetry.Config{
			ServiceName:          "websocket-throughput",
			OTLPEndpoint:         ep,
			OTLPInsecure:         true,
			MetricExportInterval: exportEvery,
		}
		var terr error
		teleShutdown, terr = telemetry.Init(ctx, teleCfg)
		if terr != nil {
			t.Fatalf("telemetry.Init (OTLP → Grafana): %v — fix collector reachability or set THROUGHPUT_OTEL_METRICS=0", terr)
		}
		defer func() {
			sctx, c := context.WithTimeout(context.Background(), 20*time.Second)
			defer c()
			if err := teleShutdown(sctx); err != nil {
				t.Logf("telemetry shutdown: %v", err)
			}
		}()
		t.Logf("OTLP metrics enabled (endpoint=%s)", ep)
	} else {
		t.Log("THROUGHPUT_OTEL_METRICS=0: websocket OTel metrics not exported from this process")
	}

	key, err := internaljwt.GetOrLoadPrivateKey()
	if err != nil {
		t.Fatalf("jwt key: %v", err)
	}

	accountIDs := buildThroughputAccountIDs(nAccounts)
	db := clients.Mongo.Database(mongocore.DatabaseName)
	t.Logf("seeding mongo for %d accounts (pool=%d per account)…", nAccounts, poolPerAcct)
	if err := seedThroughputAccounts(ctx, t, db, accountIDs, poolPerAcct); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if os.Getenv("THROUGHPUT_CLEANUP") == "1" {
		defer cleanupThroughputDocs(context.Background(), t, db)
	}

	var wsDialURLs []string
	var wsCleanup func()
	if eps := strings.TrimSpace(os.Getenv("THROUGHPUT_WS_ENDPOINTS")); eps != "" {
		wsDialURLs = parseWSEndpoints(eps)
		if len(wsDialURLs) == 0 {
			t.Fatal("THROUGHPUT_WS_ENDPOINTS produced no URLs")
		}
		wsCleanup = func() {}
		t.Logf("external websocket endpoints (%d): %v", len(wsDialURLs), wsDialURLs)
	} else if stackURLs := throughputStackWebSocketURLs(t); len(stackURLs) > 0 {
		wsDialURLs = stackURLs
		wsCleanup = func() {}
		t.Logf("compose websocket replicas (%d): %v", len(wsDialURLs), wsDialURLs)
	} else {
		wsServer := wsserver.NewServer(clients)
		ts := httptest.NewServer(http.HandlerFunc(wsServer.HandleWS))
		wsDialURLs = []string{"ws" + strings.TrimPrefix(ts.URL, "http")}
		wsCleanup = func() {
			ts.Close()
			wsServer.Shutdown()
		}
		t.Logf("in-process httptest websocket: %s", wsDialURLs[0])
	}
	defer wsCleanup()

	var writes atomic.Uint64
	var wsDeliveries atomic.Uint64
	var latCount atomic.Uint64
	latMu := sync.Mutex{}
	latSamples := make([]time.Duration, 0, 200_000)
	pending := sync.Map{}

	var activeClients atomic.Int64
	var readers sync.WaitGroup

	startReader := func(conn *websocket.Conn) {
		readers.Add(1)
		activeClients.Add(1)
		go func() {
			defer readers.Done()
			defer activeClients.Add(-1)
			for {
				_ = conn.SetReadDeadline(time.Now().Add(120 * time.Second))
				_, data, err := conn.ReadMessage()
				if err != nil {
					return
				}
				var payload map[string]interface{}
				if json.Unmarshal(data, &payload) != nil {
					continue
				}
				doc, _ := payload["document"].(map[string]interface{})
				if doc == nil || doc["throughputTest"] != true {
					continue
				}
				seqVal, ok := doc["throughputSeq"].(float64)
				if !ok {
					continue
				}
				seq := int64(seqVal)
				if t0, ok := pending.LoadAndDelete(seq); ok {
					if ts, ok := t0.(time.Time); ok {
						d := time.Since(ts)
						latMu.Lock()
						if len(latSamples) < cap(latSamples) {
							latSamples = append(latSamples, d)
						}
						latMu.Unlock()
						latCount.Add(1)
					}
				}
				wsDeliveries.Add(1)
			}
		}()
	}

	dialSem := make(chan struct{}, 192)
	var accMu sync.Mutex
	accOpen := make(map[string]int, nAccounts)
	var connMu sync.Mutex
	var liveConns []*websocket.Conn
	var connAcct []string

	wrapTryDial := func(rng *mathrand.Rand) bool {
		accMu.Lock()
		var acc string
		for attempts := 0; attempts < 64; attempts++ {
			a := accountIDs[rng.Intn(len(accountIDs))]
			if accOpen[a] < maxPerAccount {
				acc = a
				break
			}
		}
		if acc == "" {
			accMu.Unlock()
			return false
		}
		accOpen[acc]++
		accMu.Unlock()

		dialSem <- struct{}{}
		defer func() { <-dialSem }()

		conn, err := dialOneThroughputClient(ctx, wsDialURLs, key, acc)
		if err != nil {
			accMu.Lock()
			accOpen[acc]--
			accMu.Unlock()
			t.Logf("dial failed (account=%s): %v", acc, err)
			return false
		}
		connMu.Lock()
		liveConns = append(liveConns, conn)
		connAcct = append(connAcct, acc)
		connMu.Unlock()
		startReader(conn)
		return true
	}

	wrapDisconnect := func(rng *mathrand.Rand) bool {
		connMu.Lock()
		n := len(liveConns)
		if n == 0 {
			connMu.Unlock()
			return false
		}
		idx := rng.Intn(n)
		conn := liveConns[idx]
		acc := connAcct[idx]
		liveConns[idx] = liveConns[n-1]
		connAcct[idx] = connAcct[n-1]
		liveConns = liveConns[:n-1]
		connAcct = connAcct[:n-1]
		connMu.Unlock()

		accMu.Lock()
		if accOpen[acc] > 0 {
			accOpen[acc]--
		}
		accMu.Unlock()
		_ = conn.WriteControl(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, "churn"), time.Now().Add(300*time.Millisecond))
		_ = conn.Close()
		return true
	}

	// Warm-up connections toward ACTIVE_MIN.
	rngWarm := mathrand.New(mathrand.NewSource(time.Now().UnixNano()))
	warmDeadline := time.Now().Add(3 * time.Minute)
	for activeClients.Load() < int64(activeMin) && time.Now().Before(warmDeadline) {
		if !wrapTryDial(rngWarm) {
			time.Sleep(2 * time.Millisecond)
		}
	}
	t.Logf("warm-up done: active_ws≈%d (target min=%d)", activeClients.Load(), activeMin)

	deadline := time.Now().Add(duration)
	churnDone := make(chan struct{})
	// Irregular WS churn: jitter between iterations, random disconnect vs dial so connection count is not flat.
	go func() {
		defer close(churnDone)
		rng := mathrand.New(mathrand.NewSource(time.Now().UnixNano() ^ 0xCAFE))
		for time.Now().Before(deadline) {
			time.Sleep(time.Duration(5+rng.Intn(120)) * time.Millisecond)
			ac := int(activeClients.Load())
			if ac < activeMin {
				wrapTryDial(rng)
				continue
			}
			if ac > activeMax || (ac > activeMin && rng.Float64() < 0.48) {
				wrapDisconnect(rng)
				continue
			}
			if ac < activeMax {
				wrapTryDial(rng)
			}
		}
	}()

	deadlineMongo := deadline
	workerN := intFromEnvDefault(t, "THROUGHPUT_MONGO_WRITERS", 8)
	if workerN < 1 {
		workerN = 1
	}
	if workerN > 64 {
		workerN = 64
	}
	var wg sync.WaitGroup
	// Bursty Mongo traffic: mix sparse writes, large spikes (80–799 sequential updates), and medium bursts with tiny sleeps.
	for w := 0; w < workerN; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			rng := mathrand.New(mathrand.NewSource(time.Now().UnixNano() ^ int64(workerID)<<40))
			for time.Now().Before(deadlineMongo) {
				phase := rng.Float64()
				switch {
				case phase < 0.38:
					n := 1 + rng.Intn(3)
					for i := 0; i < n; i++ {
						seq := int64(writes.Add(1))
						if rng.Float64() < 0.06 {
							pending.Store(seq, time.Now())
						}
						if err := randomMongoWrite(ctx, db, accountIDs, poolPerAcct, workerID, rng, seq); err != nil {
							t.Logf("mongo write: %v", err)
							pending.Delete(seq)
						}
					}
					time.Sleep(time.Duration(150+rng.Intn(1850)) * time.Millisecond)
				case phase < 0.72:
					burst := 80 + rng.Intn(720)
					for i := 0; i < burst && time.Now().Before(deadlineMongo); i++ {
						seq := int64(writes.Add(1))
						if rng.Float64() < 0.06 {
							pending.Store(seq, time.Now())
						}
						if err := randomMongoWrite(ctx, db, accountIDs, poolPerAcct, workerID, rng, seq); err != nil {
							t.Logf("mongo write: %v", err)
							pending.Delete(seq)
						}
					}
					time.Sleep(time.Duration(rng.Intn(25)) * time.Millisecond)
				default:
					mid := 12 + rng.Intn(48)
					for i := 0; i < mid && time.Now().Before(deadlineMongo); i++ {
						seq := int64(writes.Add(1))
						if rng.Float64() < 0.06 {
							pending.Store(seq, time.Now())
						}
						if err := randomMongoWrite(ctx, db, accountIDs, poolPerAcct, workerID, rng, seq); err != nil {
							t.Logf("mongo write: %v", err)
							pending.Delete(seq)
						}
						time.Sleep(time.Duration(1+rng.Intn(6)) * time.Millisecond)
					}
					time.Sleep(time.Duration(20+rng.Intn(120)) * time.Millisecond)
				}
			}
		}(w)
	}

	progressCtx, progressCancel := context.WithCancel(context.Background())
	defer progressCancel()
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		start := time.Now()
		for {
			select {
			case <-progressCtx.Done():
				return
			case <-ticker.C:
				wr := writes.Load()
				rc := wsDeliveries.Load()
				elapsed := time.Since(start).Seconds()
				if elapsed < 1 {
					elapsed = 1
				}
				t.Logf("progress elapsed=%.0fs writes=%d ws_delivery_msgs=%d active_ws≈%d accounts=%d rate_writes/s=%.1f rate_ws_deliveries/s=%.1f",
					time.Since(start).Seconds(), wr, rc, activeClients.Load(), nAccounts, float64(wr)/elapsed, float64(rc)/elapsed)
			}
		}
	}()

	wg.Wait()
	progressCancel()
	<-churnDone

	connMu.Lock()
	for _, c := range liveConns {
		if c != nil {
			_ = c.WriteControl(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, "test done"), time.Now().Add(time.Second))
			_ = c.Close()
		}
	}
	liveConns = nil
	connAcct = nil
	connMu.Unlock()

	readersDone := make(chan struct{})
	go func() {
		readers.Wait()
		close(readersDone)
	}()
	select {
	case <-readersDone:
	case <-time.After(90 * time.Second):
		t.Log("timeout waiting for WS reader goroutines to exit")
	}
	cancel()

	wr := writes.Load()
	rc := wsDeliveries.Load()
	elapsed := duration.Seconds()
	if elapsed <= 0 {
		elapsed = 1
	}
	avgFanout := float64(rc) / float64(max64(wr, 1))
	t.Logf("final writes=%d ws_delivery_msgs=%d accounts=%d active_ws_end=%d duration=%v writes/s=%.1f deliveries/s=%.1f avg_deliveries_per_write=%.2f",
		wr, rc, nAccounts, activeClients.Load(), duration, float64(wr)/elapsed, float64(rc)/elapsed, avgFanout)

	lc := latCount.Load()
	if lc > 0 {
		latMu.Lock()
		samples := append([]time.Duration(nil), latSamples...)
		latMu.Unlock()
		sort.Slice(samples, func(i, j int) bool { return samples[i] < samples[j] })
		p50 := samples[len(samples)*50/100]
		p95 := samples[len(samples)*95/100]
		p99 := samples[len(samples)*99/100]
		t.Logf("latency mongo->ws (matched seq) n=%d p50=%s p95=%s p99=%s (subset capped at %d samples)",
			lc, p50, p95, p99, cap(latSamples))
	}

	if startWatcher && wr > 50 && float64(rc) < 0.05*float64(activeMax)*float64(wr) {
		t.Logf("warning: deliveries seem low vs load — check routing, churn, or external endpoint fan-out")
	}
}

func intFromEnvDefault(t *testing.T, key string, def int) int {
	t.Helper()
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		t.Fatalf("%s: invalid integer %q", key, v)
	}
	return n
}

// throughputStackWebSocketURLs builds ws:// URLs for Docker Compose websocket replicas when
// THROUGHPUT_WS_STACK_REPLICAS > 0. Naming matches Compose v2: "<project>-websocket-<n>".
func throughputStackWebSocketURLs(t *testing.T) []string {
	t.Helper()
	nRep := intFromEnvDefault(t, "THROUGHPUT_WS_STACK_REPLICAS", 0)
	if nRep <= 0 {
		return nil
	}
	if nRep > 32 {
		t.Fatalf("THROUGHPUT_WS_STACK_REPLICAS too high (max 32): %d", nRep)
	}
	proj := strings.TrimSpace(os.Getenv("COMPOSE_PROJECT_NAME"))
	if proj == "" {
		proj = strings.TrimSpace(os.Getenv("THROUGHPUT_COMPOSE_PROJECT"))
	}
	if proj == "" {
		proj = "eve-industry-planner"
	}
	svc := strings.TrimSpace(os.Getenv("THROUGHPUT_WS_STACK_SERVICE"))
	if svc == "" {
		svc = "websocket"
	}
	port := strings.TrimSpace(os.Getenv("THROUGHPUT_WS_INTERNAL_PORT"))
	if port == "" {
		port = "4001"
	}
	path := strings.TrimSpace(os.Getenv("THROUGHPUT_WS_INTERNAL_PATH"))
	if path == "" {
		path = "/ws"
	}
	out := make([]string, 0, nRep)
	for i := range nRep {
		host := fmt.Sprintf("%s-%s-%d", proj, svc, i+1)
		out = append(out, fmt.Sprintf("ws://%s:%s%s", host, port, path))
	}
	return out
}

func throughputOTelMetricsWant() bool {
	return strings.TrimSpace(os.Getenv("THROUGHPUT_OTEL_METRICS")) != "0"
}

func throughputOTLPEndpoint() string {
	for _, key := range []string{"OTEL_EXPORTER_OTLP_ENDPOINT", "OTLP_ENDPOINT"} {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return v
		}
	}
	return telemetry.DefaultOTLPEndpoint
}

func buildThroughputAccountIDs(n int) []string {
	out := make([]string, n)
	for i := range n {
		out[i] = fmt.Sprintf("tpacc%06d", i)
	}
	return out
}

func parseWSEndpoints(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		u := strings.TrimSpace(p)
		if u == "" {
			continue
		}
		if strings.HasPrefix(u, "http://") {
			u = "ws://" + strings.TrimPrefix(u, "http://")
		} else if strings.HasPrefix(u, "https://") {
			u = "wss://" + strings.TrimPrefix(u, "https://")
		}
		out = append(out, u)
	}
	return out
}

func dialOneThroughputClient(ctx context.Context, urls []string, key *internaljwt.CachedPrivateKey, accountID string) (*websocket.Conn, error) {
	if len(urls) == 0 {
		return nil, fmt.Errorf("no websocket URLs")
	}
	rng := mathrand.New(mathrand.NewSource(time.Now().UnixNano()))
	wsURL := urls[rng.Intn(len(urls))]
	sessionID := fmt.Sprintf("tp-sess-%s-%s", accountID, uuid.NewString())
	token, _, err := internaljwt.GenerateInternalJWT(key.Key, accountID, key.Kid, sessionID, nil, nil)
	if err != nil {
		return nil, err
	}
	dialer := websocket.Dialer{
		Subprotocols: []string{"auth." + base64.RawURLEncoding.EncodeToString([]byte(token))},
	}
	c, _, err := dialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		return nil, err
	}
	_ = c.SetReadDeadline(time.Now().Add(25 * time.Second))
	_, msg, err := c.ReadMessage()
	if err != nil {
		_ = c.Close()
		return nil, err
	}
	var m map[string]interface{}
	if json.Unmarshal(msg, &m) != nil || m["type"] != "connected" {
		_ = c.Close()
		return nil, fmt.Errorf("expected connected frame, got %s", string(msg))
	}
	return c, nil
}

func max64(a, b uint64) uint64 {
	if a > b {
		return a
	}
	return b
}

func seedThroughputAccounts(ctx context.Context, t *testing.T, db *mongo.Database, accountIDs []string, pool int) error {
	t.Helper()
	var seedWg sync.WaitGroup
	var seedMu sync.Mutex
	var seedErr error
	sem := make(chan struct{}, 24)
	for i := range accountIDs {
		i := i
		accountID := accountIDs[i]
		seedWg.Add(1)
		go func() {
			defer seedWg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			if err := seedOneAccount(ctx, db, accountID, i, pool); err != nil {
				seedMu.Lock()
				if seedErr == nil {
					seedErr = fmt.Errorf("account %s: %w", accountID, err)
				}
				seedMu.Unlock()
			}
		}()
	}
	seedWg.Wait()
	return seedErr
}

func seedOneAccount(ctx context.Context, db *mongo.Database, accountID string, idx int, pool int) error {
	for _, coll := range []string{mongocore.CollectionUsers, mongocore.CollectionApplicationSettings} {
		_, err := db.Collection(coll).UpdateOne(ctx,
			bson.M{"_id": accountID},
			bson.M{"$set": bson.M{
				"_id":             accountID,
				"accountID":       accountID,
				"throughputTest":  true,
				"_meta":           bson.M{"accountID": accountID, "lastModified": time.Now()},
				"throughputLabel": "seed",
			}},
			options.Update().SetUpsert(true),
		)
		if err != nil {
			return fmt.Errorf("%s: %w", coll, err)
		}
	}
	for i := range pool {
		gid := scopedGroupID(idx, i)
		_, err := db.Collection(mongocore.CollectionUserJobGroups).UpdateOne(ctx,
			bson.M{"_id": gid},
			bson.M{"$set": bson.M{
				"accountID":      accountID,
				"throughputTest": true,
				"name":           "tp",
				"_meta":          bson.M{"accountID": accountID, "lastModified": time.Now()},
			}},
			options.Update().SetUpsert(true),
		)
		if err != nil {
			return fmt.Errorf("user_job_groups: %w", err)
		}
	}
	for i := range pool {
		jid := scopedJobID(idx, i)
		_, err := db.Collection(mongocore.CollectionUserJobDocuments).UpdateOne(ctx,
			bson.M{"_id": jid},
			bson.M{"$set": bson.M{
				"throughputTest": true,
				"_meta":          bson.M{"accountID": accountID, "lastModified": time.Now()},
			}},
			options.Update().SetUpsert(true),
		)
		if err != nil {
			return fmt.Errorf("user_job_documents: %w", err)
		}
	}
	archN := pool / 2
	if archN < 4 {
		archN = 4
	}
	for i := range archN {
		aid := scopedArchID(idx, i)
		_, err := db.Collection(mongocore.CollectionArchivedJobs).UpdateOne(ctx,
			bson.M{"_id": aid},
			bson.M{"$set": bson.M{
				"throughputTest": true,
				"_meta":          bson.M{"accountID": accountID, "lastModified": time.Now()},
			}},
			options.Update().SetUpsert(true),
		)
		if err != nil {
			return fmt.Errorf("archivedJobs: %w", err)
		}
	}
	return nil
}

func scopedGroupID(accountIdx, slot int) string {
	return fmt.Sprintf("tpgrp_g_%d_%d", accountIdx, slot)
}

func scopedJobID(accountIdx, slot int) string {
	return fmt.Sprintf("tpgrp_j_%d_%d", accountIdx, slot)
}

func scopedLegID(accountIdx, slot int) string {
	return fmt.Sprintf("tpgrp_l_%d_%d", accountIdx, slot)
}

func scopedArchID(accountIdx, slot int) string {
	return fmt.Sprintf("tpgrp_a_%d_%d", accountIdx, slot)
}

func cleanupThroughputDocs(ctx context.Context, t *testing.T, db *mongo.Database) {
	t.Helper()
	filter := bson.M{"throughputTest": true}
	for _, c := range []string{
		mongocore.CollectionUsers,
		mongocore.CollectionApplicationSettings,
		mongocore.CollectionUserJobGroups,
		mongocore.CollectionUserJobDocuments,
		mongocore.CollectionArchivedJobs,
		mongocore.CollectionBuildStats,
		mongocore.CollectionJobs,
	} {
		res, err := db.Collection(c).DeleteMany(ctx, filter)
		if err != nil {
			t.Logf("cleanup %s: %v", c, err)
			continue
		}
		t.Logf("cleanup %s deleted=%d", c, res.DeletedCount)
	}
}

func randomMongoWrite(ctx context.Context, db *mongo.Database, accountIDs []string, poolPerAcct int, workerID int, rng *mathrand.Rand, seq int64) error {
	idx := rng.Intn(len(accountIDs))
	accountID := accountIDs[idx]
	meta := bson.M{
		"accountID":    accountID,
		"lastModified": time.Now(),
		"clientID":     fmt.Sprintf("throughput-worker-%d", workerID),
		"sessionID":    "throughput-non-ws-session",
	}
	common := bson.M{
		"throughputTest": true,
		"throughputSeq":  seq,
		"_meta":          meta,
	}

	switch rng.Intn(7) {
	case 0:
		_, err := db.Collection(mongocore.CollectionApplicationSettings).UpdateOne(ctx,
			bson.M{"_id": accountID},
			bson.M{"$set": bson.M{
				"accountID": accountID, "throughputTest": true, "throughputSeq": seq,
				"_meta":    bson.M{"accountID": accountID, "lastModified": time.Now()},
				"tpWorker": workerID,
				"tpAt":     time.Now().UnixNano(),
			}},
		)
		return err
	case 1:
		_, err := db.Collection(mongocore.CollectionUsers).UpdateOne(ctx,
			bson.M{"_id": accountID},
			bson.M{"$set": bson.M{
				"throughputTest": true, "throughputSeq": seq,
				"_meta":    bson.M{"accountID": accountID, "lastModified": time.Now()},
				"tpWorker": workerID,
				"tpAt":     time.Now().UnixNano(),
			}},
		)
		return err
	case 2:
		gid := scopedGroupID(idx, rng.Intn(poolPerAcct))
		_, err := db.Collection(mongocore.CollectionUserJobGroups).UpdateOne(ctx,
			bson.M{"_id": gid},
			bson.M{"$set": bson.M{
				"accountID": accountID, "throughputSeq": seq, "throughputTest": true,
				"_meta":    bson.M{"accountID": accountID, "lastModified": time.Now(), "clientID": meta["clientID"], "sessionID": meta["sessionID"]},
				"tpWorker": workerID,
				"tpAt":     time.Now().UnixNano(),
			}},
		)
		return err
	case 3:
		jid := scopedJobID(idx, rng.Intn(poolPerAcct))
		_, err := db.Collection(mongocore.CollectionUserJobDocuments).UpdateOne(ctx,
			bson.M{"_id": jid},
			bson.M{"$set": common},
		)
		return err
	case 4:
		jid := scopedLegID(idx, rng.Intn(poolPerAcct))
		_, err := db.Collection(mongocore.CollectionJobs).UpdateOne(ctx,
			bson.M{"_id": jid},
			bson.M{"$set": common},
			options.Update().SetUpsert(true),
		)
		return err
	case 5:
		aid := scopedArchID(idx, rng.Intn(max(4, poolPerAcct/2)))
		_, err := db.Collection(mongocore.CollectionArchivedJobs).UpdateOne(ctx,
			bson.M{"_id": aid},
			bson.M{"$set": common},
		)
		return err
	default:
		typeID := 9_000_000 + rng.Intn(50_000)
		docID := mongocore.BuildStatsDocumentID(accountID, typeID)
		_, err := db.Collection(mongocore.CollectionBuildStats).UpdateOne(ctx,
			bson.M{"_id": docID},
			bson.M{"$set": bson.M{
				"_id": docID, "throughputTest": true, "throughputSeq": seq,
				"_meta":    bson.M{"accountID": accountID, "lastModified": time.Now()},
				"tpWorker": workerID,
				"tpAt":     time.Now().UnixNano(),
			}},
			options.Update().SetUpsert(true),
		)
		return err
	}
}
