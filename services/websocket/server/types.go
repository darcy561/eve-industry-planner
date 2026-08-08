package server

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/websocket/server/model"
	syncpkg "eve-industry-planner/websocket/sync"

	"github.com/alitto/pond/v2"
	"github.com/gorilla/websocket"
	"github.com/nats-io/nats.go/jetstream"
)

type Server struct {
	// Client management
	// Exported for use by sync package
	Clients   map[string]*Client
	ClientsMu sync.RWMutex

	// Per-account client ids (account_id -> set of client_id). Caps concurrent tabs;
	// also the account: side of HostedTenants.
	userConnections map[string]map[string]bool
	userConnMu      sync.RWMutex

	// Short-lived snapshots of subscription sets for reconnect resume (in-process; see also Redis keys in session_resume.go).
	sessionHandoffs   map[string]*sessionHandoffEntry
	sessionHandoffsMu sync.Mutex

	// Active subscriptions (client_id -> map[docID]timestamp)
	// Track subscriptions per client to preserve across reconnects
	// Timestamp tracks last activity (connection/subscription) for cleanup of stale subscriptions
	activeSubscriptions map[string]map[string]time.Time
	activeSubsMu        sync.RWMutex

	// Incoming queues (client → database)
	incomingQueues  map[string]*IncomingDocQueue
	incomingSignals chan string // Channel signaling work available (docID)
	incomingMu      sync.RWMutex

	// Optional per–doc-id fan-in for explicit client subscribe (escape hatch; not used for account stream).
	explicitDocSubscribers map[string]map[string]bool // docID -> client_ids
	explicitDocSubMu       sync.RWMutex

	// Reverse indexes for corporation / alliance realtime pools (populated after upgrade_scopes).
	// Also the corporation: / alliance: side of HostedTenants.
	// Two mutexes reduce contention: corp broadcasts do not block alliance index updates and vice versa.
	// When both locks are required, always take corpIndexMu before allianceIndexMu.
	corpToClients     map[string]map[string]bool // corporation id -> client_id set
	allianceToClients map[string]map[string]bool // alliance id -> client_id set
	corpIndexMu       sync.RWMutex
	allianceIndexMu   sync.RWMutex

	// JetStream doc.update fan-out: one FIFO per shard (see outbound_doc_update.go).
	docUpdateOutboundShards []chan docUpdateWork
	outboundInFlight        atomic.Int64 // work currently inside a shard worker

	// Sync queues (client_id -> sync queue)
	// One sync per client at a time (enforced by queue)
	// Uses types from sync package
	SyncQueues  map[string]*syncpkg.SyncQueue
	SyncSignals chan string // Channel signaling sync work available (clientID)
	SyncMu      sync.RWMutex

	// Sync worker pool (pond); incoming/outgoing use per-doc mutex + goroutines instead of shared pools.
	SyncPool pond.Pool // For sync operations (separate pool) - exported for sync package

	// Configuration
	upgrader websocket.Upgrader
	Stack    *stackservices.Clients
	metrics  *websocketMetrics

	// Shutdown coordination
	// intakeStopChan stops JetStream pull loops only (outbound shard workers stay up for flush).
	// shutdownChan stops shard workers, sync coordinator, placement maintainer, cleanup.
	intakeStopChan  chan struct{}
	intakeStopOnce  sync.Once
	shutdownChan    chan struct{}
	stopConsumeOnce sync.Once   // closes shutdownChan (workers / coordinators)
	shutdownOnce    sync.Once   // sync pool + durable delete (after stopConsume)
	draining        atomic.Bool // local SIGTERM / stop drain — Ready 503 + refuse upgrades

	// Placement state publish (NATS SubjectWSPlacementState); optional override for tests.
	placementPublishFn func(subject string, data []byte) error
	placementMu        sync.Mutex
	lastPlacementState natscore.PlacementState
	hasLastPlacement   bool

	// Selective JetStream fan-out: debounced FilterSubjects from HostedTenants.
	fanoutFilterMu    sync.Mutex
	fanoutFilterTimer *time.Timer
	fanoutStream      jetstream.Stream
}

type Client struct {
	id        string
	conn      *websocket.Conn
	connCtx   context.Context // derived from HTTP request for logging (WithoutCancel); set on connect
	Send      chan []byte     // Exported for sync package
	AccountID string          // Account ID from validated app session — exported for sync package
	SessionID string          // Session ID from validated app session
	Scopes    model.RealtimeScopes

	// grantedCorpIDs / grantedAllianceIDs are org id ceilings from the server session (never trust the browser alone).
	grantedCorpIDs     map[string]struct{}
	grantedAllianceIDs map[string]struct{}

	// Explicit collection-scoped doc subscriptions (subscribe / unsubscribe JSON). Account-scoped
	// realtime does not require entries here.
	explicitDocIDs map[string]bool
	messageCount   int          // Message count for rate limiting
	lastReset      time.Time    // Last time message count was reset
	messageMu      sync.Mutex   // Protects message count
	connectedAt    time.Time    // When this connection was established
	lastActivity   time.Time    // Last time connection received activity (pong or message)
	activityMu     sync.RWMutex // Protects lastActivity
	writeMu        sync.Mutex   // Serializes conn writes (gorilla allows one writer)

	// Sync state tracking
	// Exported fields for use by sync package
	SyncInProgress bool       // True when client is syncing
	SyncStartTime  time.Time  // When sync started (for timeout detection)
	SyncMu         sync.Mutex // Protects sync state
}

type IncomingDocQueue struct {
	ch      chan Event   // Buffered channel for events
	mu      sync.RWMutex // Protects queue operations
	lastUse time.Time    // Last time queue was accessed
}

type Event struct {
	ClientID string
	DocID    string
	Msg      []byte
}

// SyncQueue and SyncMessage are now defined in the sync package
// Use sync.SyncQueue and sync.SyncMessage instead

// Implement syncpkg.SyncServer interface
func (s *Server) GetSyncQueues() map[string]*syncpkg.SyncQueue {
	return s.SyncQueues
}

func (s *Server) GetSyncSignals() chan string {
	return s.SyncSignals
}

func (s *Server) GetSyncMu() interface {
	Lock()
	Unlock()
} {
	return &s.SyncMu
}

func (s *Server) GetClients() map[string]syncpkg.SyncClient {
	// Convert map[string]*Client to map[string]syncpkg.SyncClient
	result := make(map[string]syncpkg.SyncClient, len(s.Clients))
	for k, v := range s.Clients {
		result[k] = v
	}
	return result
}

func (s *Server) GetClientsMu() interface {
	RLock()
	RUnlock()
} {
	return &s.ClientsMu
}

func (s *Server) GetSyncPool() interface {
	SubmitErr(func() error) any
} {
	// Wrap pond.Pool to match interface signature
	return &poolWrapper{p: s.SyncPool}
}

// poolWrapper wraps pond.Pool to match the interface signature
type poolWrapper struct {
	p pond.Pool
}

func (pw *poolWrapper) SubmitErr(f func() error) any {
	return pw.p.SubmitErr(f)
}

// Implement syncpkg.SyncClient interface
func (c *Client) GetSyncInProgress() bool {
	return c.SyncInProgress
}

func (c *Client) SetSyncInProgress(val bool) {
	c.SyncInProgress = val
}

func (c *Client) GetSyncStartTime() time.Time {
	return c.SyncStartTime
}

func (c *Client) SetSyncStartTime(t time.Time) {
	c.SyncStartTime = t
}

func (c *Client) GetSyncMu() interface {
	Lock()
	Unlock()
} {
	return &c.SyncMu
}

func (c *Client) GetAccountID() string {
	return c.AccountID
}

func (c *Client) GetSend() chan []byte {
	return c.Send
}

// LogContext returns the connection-scoped context for structured logging.
func (c *Client) LogContext() context.Context {
	if c.connCtx != nil {
		return c.connCtx
	}
	return context.Background()
}

// clientLogCtx returns a client's LogContext, or Background if unknown or disconnected.
func (s *Server) clientLogCtx(clientID string) context.Context {
	if clientID == "" {
		return context.Background()
	}
	s.ClientsMu.RLock()
	c := s.Clients[clientID]
	s.ClientsMu.RUnlock()
	if c == nil {
		return context.Background()
	}
	return c.LogContext()
}

// Implement syncpkg.SyncServer interface - MongoDB access
func (s *Server) GetMongoClient() interface{} {
	if s.Stack == nil || s.Stack.Mongo == nil {
		return nil
	}
	return s.Stack.Mongo
}
