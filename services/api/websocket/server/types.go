package server

import (
	"sync"
	"time"

	syncpkg "eve-industry-planner/api/websocket/sync"
	"eve-industry-planner/shared/shared"

	"github.com/alitto/pond/v2"
	"github.com/gorilla/websocket"
)

type Server struct {
	// Client management
	// Exported for use by sync package
	Clients   map[string]*Client
	ClientsMu sync.RWMutex

	// User connection tracking (account_id -> []client_id)
	userConnections map[string]map[string]bool
	userConnMu      sync.RWMutex

	// Active subscriptions (client_id -> map[docID]timestamp)
	// Track subscriptions per client to preserve across reconnects
	// Timestamp tracks last activity (connection/subscription) for cleanup of stale subscriptions
	activeSubscriptions map[string]map[string]time.Time
	activeSubsMu        sync.RWMutex

	// Incoming queues (client → database)
	incomingQueues  map[string]*IncomingDocQueue
	incomingSignals chan string // Channel signaling work available (docID)
	incomingMu      sync.RWMutex

	// Incoming bulk queue (for bulk operations)
	// Persistent queue, no cleanup needed
	incomingBulkQueue   *BulkQueue
	incomingBulkSignals chan struct{} // Channel signaling bulk work available

	// Outgoing queues (NATS → clients)
	outgoingQueues  map[string]*OutgoingDocQueue
	outgoingSignals chan string // Channel signaling work available (docID)
	outgoingMu      sync.RWMutex

	// Sync queues (client_id -> sync queue)
	// One sync per client at a time (enforced by queue)
	// Uses types from sync package
	SyncQueues  map[string]*syncpkg.SyncQueue
	SyncSignals chan string // Channel signaling sync work available (clientID)
	SyncMu      sync.RWMutex

	// Worker pools (independent, limited)
	incomingPool pond.Pool // For DB writes (limited to match MongoDB pool)
	outgoingPool pond.Pool // For broadcasts (higher limit for fast processing)
	SyncPool     pond.Pool // For sync operations (separate pool) - exported for sync package

	// Configuration
	upgrader       websocket.Upgrader
	ServiceClients *shared.ServiceClients

	// Shutdown coordination
	shutdownChan chan struct{}
}

type Client struct {
	id             string
	conn           *websocket.Conn
	Send           chan []byte     // Exported for sync package
	subscribedDocs map[string]bool // Track which documents this client is subscribed to
	AccountID      string          // Account ID from JWT claims - exported for sync package
	messageCount   int             // Message count for rate limiting
	lastReset      time.Time       // Last time message count was reset
	messageMu      sync.Mutex      // Protects message count
	connectedAt    time.Time       // When this connection was established
	lastActivity   time.Time       // Last time connection received activity (pong or message)
	activityMu     sync.RWMutex     // Protects lastActivity

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

type OutgoingDocQueue struct {
	ch          chan Event      // Buffered channel for events
	mu          sync.RWMutex    // Protects queue operations
	lastUse     time.Time       // Last time queue was accessed
	subscribers map[string]bool // Client IDs subscribed to this document
}

type Event struct {
	ClientID string
	DocID    string
	Msg      []byte
}

// Operation represents a single document operation (ADD, UPDATE, DELETE)
type Operation struct {
	DocumentID string
	Action     string // ADD, UPDATE, DELETE
	Data       map[string]interface{}
	ClientID   string
}

// BulkQueue handles bulk operations (arrays of operations)
// Used for incoming bulk operations (client → database)
// Persistent queue, no cleanup needed
type BulkQueue struct {
	ch chan []Operation // Channel for bulk operations (arrays of operations)
	mu sync.RWMutex     // Protects queue operations (prevents multiple workers)
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
	SubmitErr(func() error) interface{}
} {
	// Wrap pond.Pool to match interface signature
	return &poolWrapper{p: s.SyncPool}
}

// poolWrapper wraps pond.Pool to match the interface signature
type poolWrapper struct {
	p pond.Pool
}

func (pw *poolWrapper) SubmitErr(f func() error) interface{} {
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

// Implement syncpkg.SyncServer interface - MongoDB access
func (s *Server) GetMongoClient() interface{} {
	if s.ServiceClients == nil || s.ServiceClients.Mongo == nil {
		return nil
	}
	return s.ServiceClients.Mongo
}
