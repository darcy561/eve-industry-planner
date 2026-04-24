package server

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/websocket/server/config"
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
	// Sync worker pool (pond). Incoming document work uses per-docID mutex serialization in processIncomingQueue.
	syncPool := pond.NewPool(config.SyncPoolSize)

	shardN := config.DocUpdateOutboundShardCount
	if shardN < 1 {
		shardN = 1
	}
	shards := make([]chan docUpdateWork, shardN)
	for i := range shards {
		shards[i] = make(chan docUpdateWork, config.DocUpdateOutboundShardQueueCap)
	}

	s := &Server{
		Clients:                 make(map[string]*Client),
		userConnections:         make(map[string]map[string]bool),
		sessionConnections:      make(map[string]string),
		sessionHandoffs:         make(map[string]*sessionHandoffEntry),
		activeSubscriptions:     make(map[string]map[string]time.Time),
		incomingQueues:          make(map[string]*IncomingDocQueue),
		incomingSignals:         make(chan string, config.SignalChannelBuffer),
		explicitDocSubscribers:  make(map[string]map[string]bool),
		corpToClients:           make(map[string]map[string]bool),
		allianceToClients:       make(map[string]map[string]bool),
		docUpdateOutboundShards: shards,
		SyncQueues:              make(map[string]*syncpkg.SyncQueue),
		SyncSignals:             make(chan string, config.SignalChannelBuffer),
		SyncPool:                syncPool,
		upgrader:                upgrader,
		ServiceClients:          clients,
		shutdownChan:            make(chan struct{}),
	}

	logs.DebugCtx(context.Background(), "websocket server instance created",
		"sync_pool_size", config.SyncPoolSize)

	s.initMetrics()

	// Start coordinator goroutines
	s.startIncomingCoordinator()

	// Start sync coordinator
	processFn := func(clientID string) error {
		return syncpkg.ProcessSyncQueue(s, clientID, syncpkg.SyncTimeout)
	}
	syncpkg.StartSyncCoordinator(s, s.shutdownChan, processFn)

	// Start NATS subscription for document updates
	s.subscribeToDocUpdates()

	// Lock notifications (API → NATS doc.lock.{accountID} → all tabs)
	s.subscribeToDocLockNotifications()

	// Start cleanup goroutine for idle queues
	s.startCleanupGoroutine()

	return s
}
