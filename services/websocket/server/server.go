package server

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	syncpkg "eve-industry-planner/websocket/sync"

	"github.com/alitto/pond/v2"
	"github.com/gorilla/websocket"
)

// getMessageTypeName converts websocket message type to readable string
func getMessageTypeName(messageType int) string {
	switch messageType {
	case websocket.TextMessage:
		return "TextMessage"
	case websocket.BinaryMessage:
		return "BinaryMessage"
	case websocket.CloseMessage:
		return "CloseMessage"
	case websocket.PingMessage:
		return "PingMessage"
	case websocket.PongMessage:
		return "PongMessage"
	default:
		return fmt.Sprintf("Unknown(%d)", messageType)
	}
}

// NewServer creates a new WebSocket server instance
func NewServer(clients *shared.ServiceClients) *Server {
	// Create independent worker pools
	// Incoming: Limited to match MongoDB connection pool (MaxPoolSize=10)
	// Outgoing: Higher limit for fast broadcasts
	// Sync: Separate pool for sync operations
	incomingPool := pond.NewPool(IncomingPoolSize)
	outgoingPool := pond.NewPool(OutgoingPoolSize)
	syncPool := pond.NewPool(SyncPoolSize)

	s := &Server{
		Clients:             make(map[string]*Client),
		userConnections:     make(map[string]map[string]bool),
		activeSubscriptions: make(map[string]map[string]time.Time),
		incomingQueues:      make(map[string]*IncomingDocQueue),
		incomingSignals:     make(chan string, SignalChannelBuffer),
		incomingBulkQueue: &BulkQueue{
			ch: make(chan []Operation, QueueBufferSize),
		},
		incomingBulkSignals: make(chan struct{}, SignalChannelBuffer),
		outgoingQueues:      make(map[string]*OutgoingDocQueue),
		outgoingSignals:     make(chan string, SignalChannelBuffer),
		SyncQueues:          make(map[string]*syncpkg.SyncQueue),
		SyncSignals:         make(chan string, SignalChannelBuffer),
		incomingPool:        incomingPool,
		outgoingPool:        outgoingPool,
		SyncPool:            syncPool,
		upgrader:            upgrader,
		ServiceClients:      clients,
		shutdownChan:        make(chan struct{}),
	}

	logs.DebugCtx(context.Background(), "websocket server instance created",
		"incoming_pool_size", IncomingPoolSize,
		"outgoing_pool_size", OutgoingPoolSize,
		"sync_pool_size", SyncPoolSize)

	// Start coordinator goroutines
	s.startIncomingCoordinator()
	s.startOutgoingCoordinator()

	// Start sync coordinator
	processFn := func(clientID string) error {
		return syncpkg.ProcessSyncQueue(s, clientID, syncpkg.SyncTimeout)
	}
	syncpkg.StartSyncCoordinator(s, s.shutdownChan, processFn)

	// Start NATS subscription for document updates
	s.subscribeToDocUpdates()

	// Start NATS subscription for subscription requests
	s.subscribeToDocSubscriptions()

	// Start cleanup goroutine for idle queues
	s.startCleanupGoroutine()

	return s
}
