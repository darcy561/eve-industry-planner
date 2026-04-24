package server

import (
	"context"
	"sync"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/identity"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

var websocketMeter = sync.OnceValue(func() metric.Meter {
	return otel.Meter("eve-industry-planner/websocket")
})

type websocketMetrics struct {
	upgradeDurationMs            metric.Float64Histogram
	upgradeRequestsTotal         metric.Int64Counter
	upgradeSuccessesTotal        metric.Int64Counter
	upgradeErrorsTotal           metric.Int64Counter
	expiredTokenRejectsTotal     metric.Int64Counter
	connectionsOpenedTotal       metric.Int64Counter
	connectionsClosedTotal       metric.Int64Counter
	docUpdatesSentTotal          metric.Int64Counter
	duplicateSessionClientsTotal metric.Int64Counter
}

var (
	websocketMetricsOnce sync.Once
	websocketMetricsInst *websocketMetrics
)

func getWebsocketMetrics() *websocketMetrics {
	websocketMetricsOnce.Do(func() {
		m := websocketMeter()
		websocketMetricsInst = &websocketMetrics{
			upgradeDurationMs: mustWSHist(m.Float64Histogram("ws.upgrade.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of websocket upgrade requests in milliseconds."),
			)),
			upgradeRequestsTotal: mustWSCounter(m.Int64Counter("ws.upgrade.requests_total",
				metric.WithDescription("Total websocket upgrade requests."),
			)),
			upgradeSuccessesTotal: mustWSCounter(m.Int64Counter("ws.upgrade.successes_total",
				metric.WithDescription("Successful websocket upgrades."),
			)),
			upgradeErrorsTotal: mustWSCounter(m.Int64Counter("ws.upgrade.errors_total",
				metric.WithDescription("Websocket upgrade errors by reason."),
			)),
			expiredTokenRejectsTotal: mustWSCounter(m.Int64Counter("ws.auth.expired_token_rejects_total",
				metric.WithDescription("Websocket upgrades rejected because JWT is expired."),
			)),
			connectionsOpenedTotal: mustWSCounter(m.Int64Counter("ws.connections.opened_total",
				metric.WithDescription("Websocket connections opened by account."),
			)),
			connectionsClosedTotal: mustWSCounter(m.Int64Counter("ws.connections.closed_total",
				metric.WithDescription("Websocket connections closed by account."),
			)),
			docUpdatesSentTotal: mustWSCounter(m.Int64Counter("ws.document_updates.sent_total",
				metric.WithDescription("Document updates sent to websocket clients by account/document."),
			)),
			duplicateSessionClientsTotal: mustWSCounter(m.Int64Counter("ws.session.duplicate_clients_total",
				metric.WithDescription("Duplicate websocket clients detected for same session id."),
			)),
		}
	})
	return websocketMetricsInst
}

func mustWSCounter(c metric.Int64Counter, err error) metric.Int64Counter {
	if err != nil {
		panic("wsmetrics: Int64Counter: " + err.Error())
	}
	return c
}

func mustWSHist(h metric.Float64Histogram, err error) metric.Float64Histogram {
	if err != nil {
		panic("wsmetrics: Float64Histogram: " + err.Error())
	}
	return h
}

func (s *Server) initMetrics() {
	s.metrics = getWebsocketMetrics()
	s.registerGaugeCallbacks()
}

func (s *Server) registerGaugeCallbacks() {
	m := websocketMeter()

	connectedClientsGauge, err := m.Int64ObservableGauge("ws.connected_clients",
		metric.WithUnit("{clients}"),
		metric.WithDescription("Current number of connected websocket clients."),
	)
	if err != nil {
		logs.ErrorCtx(context.Background(), "wsmetrics: connected_clients gauge create failed", "error", err)
		return
	}
	connectedAccountsGauge, err := m.Int64ObservableGauge("ws.connected_accounts",
		metric.WithUnit("{accounts}"),
		metric.WithDescription("Current number of accounts with at least one websocket client."),
	)
	if err != nil {
		logs.ErrorCtx(context.Background(), "wsmetrics: connected_accounts gauge create failed", "error", err)
		return
	}
	accountClientsGauge, err := m.Int64ObservableGauge("ws.account_connected_clients",
		metric.WithUnit("{clients}"),
		metric.WithDescription("Current connected websocket clients per account."),
	)
	if err != nil {
		logs.ErrorCtx(context.Background(), "wsmetrics: account_connected_clients gauge create failed", "error", err)
		return
	}
	clientDocsGauge, err := m.Int64ObservableGauge("ws.client_subscribed_documents",
		metric.WithUnit("{documents}"),
		metric.WithDescription("Current subscribed document count per client."),
	)
	if err != nil {
		logs.ErrorCtx(context.Background(), "wsmetrics: client_subscribed_documents gauge create failed", "error", err)
		return
	}
	docSubscribersGauge, err := m.Int64ObservableGauge("ws.document_subscribers",
		metric.WithUnit("{clients}"),
		metric.WithDescription("Current subscriber count per document."),
	)
	if err != nil {
		logs.ErrorCtx(context.Background(), "wsmetrics: document_subscribers gauge create failed", "error", err)
		return
	}

	_, err = m.RegisterCallback(func(ctx context.Context, o metric.Observer) error {
		// Same identity as JetStream durable suffix so dashboards can split gauges per replica.
		wsInstanceAttr := attribute.String("ws_instance_id", identity.JetStreamConsumerSuffix())

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

		s.explicitDocSubMu.RLock()
		docSubscriberCounts := make(map[string]int64, len(s.explicitDocSubscribers))
		for docID, subs := range s.explicitDocSubscribers {
			docSubscriberCounts[docID] = int64(len(subs))
		}
		s.explicitDocSubMu.RUnlock()

		o.ObserveInt64(connectedClientsGauge, totalClients, metric.WithAttributes(wsInstanceAttr))
		o.ObserveInt64(connectedAccountsGauge, totalAccounts, metric.WithAttributes(wsInstanceAttr))

		for accountID, count := range accountCounts {
			o.ObserveInt64(accountClientsGauge, count, metric.WithAttributes(
				attribute.String("account_id", accountID),
				wsInstanceAttr,
			))
		}
		for _, row := range clientDocCounts {
			o.ObserveInt64(clientDocsGauge, row.docCount, metric.WithAttributes(
				attribute.String("client_id", row.clientID),
				attribute.String("account_id", row.accountID),
				wsInstanceAttr,
			))
		}
		for docID, count := range docSubscriberCounts {
			o.ObserveInt64(docSubscribersGauge, count, metric.WithAttributes(
				attribute.String("doc_id", docID),
				wsInstanceAttr,
			))
		}
		return nil
	}, connectedClientsGauge, connectedAccountsGauge, accountClientsGauge, clientDocsGauge, docSubscribersGauge)
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

func (s *Server) recordExpiredTokenReject(ctx context.Context) {
	if s.metrics == nil {
		return
	}
	s.metrics.expiredTokenRejectsTotal.Add(ctx, 1)
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

func (s *Server) recordDuplicateSessionClient(ctx context.Context, accountID, sessionID string) {
	if s.metrics == nil {
		return
	}
	s.metrics.duplicateSessionClientsTotal.Add(ctx, 1, metric.WithAttributes(
		attribute.String("account_id", accountID),
		attribute.String("session_id", sessionID),
	))
}
