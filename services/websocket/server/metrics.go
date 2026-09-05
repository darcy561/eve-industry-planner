package server

import (
	"context"
	"sync"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/telemetry"
	"eve-industry-planner/websocket/server/config"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

type websocketMetrics struct {
	upgradeDurationMs      metric.Float64Histogram
	upgradeRequestsTotal   metric.Int64Counter
	upgradeSuccessesTotal  metric.Int64Counter
	upgradeErrorsTotal     metric.Int64Counter
	connectionsOpenedTotal metric.Int64Counter
	connectionsClosedTotal metric.Int64Counter
	docUpdatesSentTotal    metric.Int64Counter
}

var (
	websocketMetricsOnce sync.Once
	websocketMetricsInst *websocketMetrics
)

func getWebsocketMetrics() *websocketMetrics {
	websocketMetricsOnce.Do(func() {
		m := telemetry.Meter("websocket")
		websocketMetricsInst = &websocketMetrics{
			upgradeDurationMs: telemetry.Must(m.Float64Histogram("ws.upgrade.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of websocket upgrade requests in milliseconds."),
			)),
			upgradeRequestsTotal: telemetry.Must(m.Int64Counter("ws.upgrade.requests_total",
				metric.WithDescription("Total websocket upgrade requests."),
			)),
			upgradeSuccessesTotal: telemetry.Must(m.Int64Counter("ws.upgrade.successes_total",
				metric.WithDescription("Successful websocket upgrades."),
			)),
			upgradeErrorsTotal: telemetry.Must(m.Int64Counter("ws.upgrade.errors_total",
				metric.WithDescription("Websocket upgrade errors by reason."),
			)),
			connectionsOpenedTotal: telemetry.Must(m.Int64Counter("ws.connections.opened_total",
				metric.WithDescription("Websocket connections opened by account."),
			)),
			connectionsClosedTotal: telemetry.Must(m.Int64Counter("ws.connections.closed_total",
				metric.WithDescription("Websocket connections closed by account."),
			)),
			docUpdatesSentTotal: telemetry.Must(m.Int64Counter("ws.document_updates.sent_total",
				metric.WithDescription("Document updates sent to websocket clients by account/document."),
			)),
		}
	})
	return websocketMetricsInst
}

func (s *Server) initMetrics() {
	s.metrics = getWebsocketMetrics()
	s.registerGaugeCallbacks()
	s.registerPlacementGauges()
}

// registerPlacementGauges reports the load state the routers place clients from: the flags a
// backend advertises, and the thresholds those flags are derived against. Without the thresholds a
// client count says nothing about headroom, since they are per-deployment environment values.
func (s *Server) registerPlacementGauges() {
	m := telemetry.Meter("websocket")

	flag := telemetry.Must(m.Int64ObservableGauge("ws.placement.flag",
		metric.WithDescription("Load-management flags this backend advertises, 1 when set: draining (stopping or kicking), cordoned (accepting no new homes), soft (past target clients), full (past the cutoff)."),
	))
	targetClients := telemetry.Must(m.Int64ObservableGauge("ws.placement.target_clients",
		metric.WithUnit("{clients}"),
		metric.WithDescription("Client count above which this backend reports soft."),
	))
	clientCutoff := telemetry.Must(m.Int64ObservableGauge("ws.placement.client_cutoff",
		metric.WithUnit("{clients}"),
		metric.WithDescription("Client count above which this backend reports full and routers stop placing on it."),
	))

	_, err := m.RegisterCallback(func(_ context.Context, o metric.Observer) error {
		state := s.CurrentPlacementSnapshot()
		for name, set := range map[string]bool{
			"draining": s.IsDraining(),
			"cordoned": s.IsCordoned(),
			"soft":     state.Soft,
			"full":     state.Full,
		} {
			var v int64
			if set {
				v = 1
			}
			o.ObserveInt64(flag, v, metric.WithAttributes(attribute.String("flag", name)))
		}
		o.ObserveInt64(targetClients, int64(config.TargetClients()))
		o.ObserveInt64(clientCutoff, int64(config.ClientCutoff()))
		return nil
	}, flag, targetClients, clientCutoff)
	if err != nil {
		logs.ErrorCtx(context.Background(), "wsmetrics: register placement gauge callback failed", "error", err)
	}
}

func (s *Server) registerGaugeCallbacks() {
	m := telemetry.Meter("websocket")

	connectedClientsGauge := telemetry.Must(m.Int64ObservableGauge("ws.connected_clients",
		metric.WithUnit("{clients}"),
		metric.WithDescription("Current number of connected websocket clients."),
	))
	connectedAccountsGauge := telemetry.Must(m.Int64ObservableGauge("ws.connected_accounts",
		metric.WithUnit("{accounts}"),
		metric.WithDescription("Current number of accounts with at least one websocket client."),
	))
	accountClientsGauge := telemetry.Must(m.Int64ObservableGauge("ws.account_connected_clients",
		metric.WithUnit("{clients}"),
		metric.WithDescription("Current connected websocket clients per account."),
	))
	clientDocsGauge := telemetry.Must(m.Int64ObservableGauge("ws.client_subscribed_documents",
		metric.WithUnit("{documents}"),
		metric.WithDescription("Current subscribed document count per client."),
	))
	docSubscribersGauge := telemetry.Must(m.Int64ObservableGauge("ws.document_subscribers",
		metric.WithUnit("{clients}"),
		metric.WithDescription("Current subscriber count per document."),
	))
	ownerClientsGauge := telemetry.Must(m.Int64ObservableGauge("ws.owner_connected_clients",
		metric.WithUnit("{clients}"),
		metric.WithDescription("Current connected websocket clients per owner, on this backend."),
	))
	connectedOwnersGauge := telemetry.Must(m.Int64ObservableGauge("ws.connected_owners",
		metric.WithUnit("{owners}"),
		metric.WithDescription("Current number of owners with at least one websocket client."),
	))

	_, err := m.RegisterCallback(func(ctx context.Context, o metric.Observer) error {
		// Per-container split uses OTel resource service.instance.id (Prom:
		// service_instance_id via Alloy resource_to_telemetry_conversion).

		s.ClientsMu.RLock()
		totalClients := int64(len(s.Clients))
		clientDocCounts := make([]struct {
			clientID  string
			accountID string
			docCount  int64
		}, 0, len(s.Clients))
		for id, c := range s.Clients {
			clientDocCounts = append(clientDocCounts, struct {
				clientID  string
				accountID string
				docCount  int64
			}{
				clientID:  id,
				accountID: c.AccountID,
				docCount:  int64(len(c.explicitDocIDs)),
			})
		}
		s.ClientsMu.RUnlock()

		s.userConnMu.RLock()
		totalAccounts := int64(len(s.userConnections))
		accountCounts := make(map[string]int64, len(s.userConnections))
		for accountID, conns := range s.userConnections {
			accountCounts[accountID] = int64(len(conns))
		}
		s.userConnMu.RUnlock()

		// Keyed by owner rather than by kind: a kind added to models.OwnerKind is picked up
		// by adding it here, and dashboards split on the label instead of on a metric name.
		// Lock order is corpRefIndexMu before allianceRefIndexMu (see types.go).
		type ownerKey struct{ kind, id string }
		ownerCounts := make(map[ownerKey]int64)
		for accountID, count := range accountCounts {
			ownerCounts[ownerKey{string(models.OwnerAccount), accountID}] = count
		}

		s.corpRefIndexMu.RLock()
		for ref, clients := range s.corpRefToClients {
			if len(clients) > 0 {
				ownerCounts[ownerKey{string(models.OwnerCorporation), ref}] = int64(len(clients))
			}
		}
		s.corpRefIndexMu.RUnlock()

		s.allianceRefIndexMu.RLock()
		for ref, clients := range s.allianceRefToClients {
			if len(clients) > 0 {
				ownerCounts[ownerKey{string(models.OwnerAlliance), ref}] = int64(len(clients))
			}
		}
		s.allianceRefIndexMu.RUnlock()

		s.explicitDocSubMu.RLock()
		docSubscriberCounts := make(map[string]int64, len(s.explicitDocSubscribers))
		for docID, subs := range s.explicitDocSubscribers {
			docSubscriberCounts[docID] = int64(len(subs))
		}
		s.explicitDocSubMu.RUnlock()

		o.ObserveInt64(connectedClientsGauge, totalClients)
		o.ObserveInt64(connectedAccountsGauge, totalAccounts)

		for accountID, count := range accountCounts {
			o.ObserveInt64(accountClientsGauge, count, metric.WithAttributes(
				attribute.String("account_id", accountID),
			))
		}
		for _, row := range clientDocCounts {
			o.ObserveInt64(clientDocsGauge, row.docCount, metric.WithAttributes(
				attribute.String("client_id", row.clientID),
				attribute.String("account_id", row.accountID),
			))
		}
		for docID, count := range docSubscriberCounts {
			o.ObserveInt64(docSubscribersGauge, count, metric.WithAttributes(
				attribute.String("doc_id", docID),
			))
		}
		o.ObserveInt64(connectedOwnersGauge, int64(len(ownerCounts)))
		for key, count := range ownerCounts {
			o.ObserveInt64(ownerClientsGauge, count, metric.WithAttributes(
				attribute.String("owner_kind", key.kind),
				attribute.String("owner_id", key.id),
			))
		}
		return nil
	}, connectedClientsGauge, connectedAccountsGauge, accountClientsGauge, clientDocsGauge, docSubscribersGauge,
		ownerClientsGauge, connectedOwnersGauge)
	if err != nil {
		logs.ErrorCtx(context.Background(), "wsmetrics: register gauge callback failed", "error", err)
	}
}

func (s *Server) recordUpgradeRequest(ctx context.Context) {
	if s.metrics == nil {
		return
	}
	s.metrics.upgradeRequestsTotal.Add(ctx, 1)
}

func (s *Server) recordUpgradeSuccess(ctx context.Context, accountID string, d time.Duration) {
	if s.metrics == nil {
		return
	}
	s.metrics.upgradeSuccessesTotal.Add(ctx, 1)
	s.metrics.connectionsOpenedTotal.Add(ctx, 1, metric.WithAttributes(attribute.String("account_id", accountID)))
	s.metrics.upgradeDurationMs.Record(ctx, float64(d.Nanoseconds())/1e6)
}

func (s *Server) recordConnectionClosed(ctx context.Context, accountID string) {
	if s.metrics == nil {
		return
	}
	s.metrics.connectionsClosedTotal.Add(ctx, 1, metric.WithAttributes(attribute.String("account_id", accountID)))
}

func (s *Server) recordUpgradeError(ctx context.Context, reason string, d time.Duration) {
	if s.metrics == nil {
		return
	}
	s.metrics.upgradeErrorsTotal.Add(ctx, 1, metric.WithAttributes(attribute.String("reason", reason)))
	s.metrics.upgradeDurationMs.Record(ctx, float64(d.Nanoseconds())/1e6)
}

func (s *Server) recordDocUpdateSent(ctx context.Context, accountID, docID string, recipients int) {
	if s.metrics == nil || recipients <= 0 {
		return
	}
	s.metrics.docUpdatesSentTotal.Add(ctx, int64(recipients), metric.WithAttributes(
		attribute.String("account_id", accountID),
		attribute.String("doc_id", docID),
	))
}
