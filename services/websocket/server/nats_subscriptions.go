package server

import (
	"context"
	"fmt"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"

	"github.com/nats-io/nats.go/jetstream"
)

// subscribeToDocUpdates subscribes to NATS document update notifications
// and enqueues them to the outgoing queue for broadcasting to clients
func (s *Server) subscribeToDocUpdates() {
	ctx := context.Background()
	if s.ServiceClients == nil || s.ServiceClients.JetStream == nil {
		logs.WarnCtx(ctx, "JetStream not available, document update subscription disabled")
		return
	}

	// Ensure the document update stream exists
	if err := natscore.EnsureDocUpdateStream(s.ServiceClients.JetStream); err != nil {
		logs.ErrorCtx(ctx, "failed to ensure doc update stream", "error", err)
		return
	}

	// Get or ensure the stream
	stream, err := natscore.GetOrEnsureStream(
		ctx,
		s.ServiceClients.JetStream,
		natscore.EnsureDocUpdateStream,
		natscore.DocUpdateStream,
	)
	if err != nil {
		logs.ErrorCtx(ctx, "failed to get doc update stream", "error", err)
		return
	}

	// Create or get durable consumer
	// FilterSubject: "doc.update.>" to receive all document updates
	// DeliverPolicy: DeliverLastPolicy to only get new messages on startup
	consumerConfig := jetstream.ConsumerConfig{
		Durable:       natscore.ConsumerDocUpdates,
		FilterSubject: "doc.update.>",
		DeliverPolicy: jetstream.DeliverLastPolicy,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       30 * time.Second,
		MaxDeliver:    5,
	}

	consumer, err := natscore.GetOrCreateConsumer(ctx, stream, consumerConfig)
	if err != nil {
		logs.ErrorCtx(ctx, "failed to create doc updates consumer", "error", err)
		return
	}

	// Create message processor
	processor := func(msg jetstream.Msg) {
		// Extract docID from subject (format: doc.update.{collection}.{docID})
		subject := msg.Subject()
		docID, err := natscore.ExtractIDFromSubject(subject, natscore.SubjectDocUpdate)
		if err != nil {
			logs.WarnCtx(ctx, "invalid doc update subject format", "subject", subject, "error", err)
			deliveryCount := natscore.GetDeliveryCount(msg)
			natscore.AcknowledgeMessage(msg, "invalid subject format", deliveryCount)
			return
		}

		// Get message data
		messageData := msg.Data()

		// Enqueue to outgoing queue for broadcasting (queue worker will handle INSERT vs UPDATE/DELETE)
		// The queue worker will extract sourceClientID, operationType, and accountID from the message
		s.enqueueOutgoingEvent(docID, messageData)

		// Acknowledge message
		deliveryCount := natscore.GetDeliveryCount(msg)
		natscore.AcknowledgeMessage(msg, "doc update processed", deliveryCount)
		logs.DebugCtx(ctx, "doc update message processed",
			"doc_id", docID,
			"subject", subject)
	}

	// Start message processing loop
	stopChan := make(chan struct{})
	go func() {
		<-s.shutdownChan
		close(stopChan)
	}()

	// Use the helper function from internal/core/nats
	natscore.StartMessageProcessingLoop(
		consumer,
		processor,
		stopChan,
		"doc.update.>",
	)

	logs.DebugCtx(ctx, "subscribed to document updates",
		"subject", "doc.update.>",
		"consumer", natscore.ConsumerDocUpdates)
}

// subscribeToDocSubscriptions subscribes to NATS subscription requests
// and subscribes clients to the requested documents
func (s *Server) subscribeToDocSubscriptions() {
	ctx := context.Background()
	if s.ServiceClients == nil || s.ServiceClients.JetStream == nil {
		logs.WarnCtx(ctx, "JetStream not available, document subscription handler disabled")
		return
	}

	// Ensure the document update stream exists (subscription messages use the same stream)
	if err := natscore.EnsureDocUpdateStream(s.ServiceClients.JetStream); err != nil {
		logs.ErrorCtx(ctx, "failed to ensure doc update stream", "error", err)
		return
	}

	// Get or ensure the stream
	stream, err := natscore.GetOrEnsureStream(
		ctx,
		s.ServiceClients.JetStream,
		natscore.EnsureDocUpdateStream,
		natscore.DocUpdateStream,
	)
	if err != nil {
		logs.ErrorCtx(ctx, "failed to get doc update stream", "error", err)
		return
	}

	// Create or get durable consumer for subscription requests
	// FilterSubject: "doc.subscribe.>" to receive all subscription requests
	consumerConfig := jetstream.ConsumerConfig{
		Durable:       "doc-subscribe-consumer",
		FilterSubject: "doc.subscribe.>",
		DeliverPolicy: jetstream.DeliverLastPolicy,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       30 * time.Second,
		MaxDeliver:    5,
	}

	consumer, err := natscore.GetOrCreateConsumer(ctx, stream, consumerConfig)
	if err != nil {
		logs.ErrorCtx(ctx, "failed to create doc subscribe consumer", "error", err)
		return
	}

	// Create message processor
	processor := func(msg jetstream.Msg) {
		// Extract accountID from subject (format: doc.subscribe.{accountID})
		subject := msg.Subject()
		logs.InfoCtx(ctx, "received doc subscription request", "subject", subject)

		accountID, err := natscore.ExtractIDFromSubject(subject, natscore.SubjectDocSubscribe)
		if err != nil {
			logs.WarnCtx(ctx, "invalid doc subscribe subject format", "subject", subject, "error", err)
			deliveryCount := natscore.GetDeliveryCount(msg)
			natscore.AcknowledgeMessage(msg, "invalid subject format", deliveryCount)
			return
		}

		// Parse message body to get collection and docIDs
		subscriptionRequest, err := natscore.UnmarshalMessagePayload[natscore.SubscriptionRequest](msg)
		if err != nil {
			logs.WarnCtx(ctx, "failed to parse subscription request",
				"account_id", accountID,
				"error", err)
			deliveryCount := natscore.GetDeliveryCount(msg)
			natscore.AcknowledgeMessage(msg, "invalid subscription request", deliveryCount)
			return
		}

		// Validate collection
		if subscriptionRequest.Collection == "" {
			logs.WarnCtx(ctx, "subscription request missing collection",
				"account_id", accountID)
			deliveryCount := natscore.GetDeliveryCount(msg)
			natscore.AcknowledgeMessage(msg, "missing collection", deliveryCount)
			return
		}

		// Subscribe clients to documents with collection-scoped docIDs
		// Format: {collection}.{docID} (e.g., "users.account123" or "jobs.job456")
		if len(subscriptionRequest.DocIDs) > 0 {
			collectionScopedDocIDs := make([]string, 0, len(subscriptionRequest.DocIDs))
			for _, docID := range subscriptionRequest.DocIDs {
				// Format: collection.docID
				collectionScopedDocID := fmt.Sprintf("%s.%s", subscriptionRequest.Collection, docID)
				collectionScopedDocIDs = append(collectionScopedDocIDs, collectionScopedDocID)
			}
			logs.InfoCtx(ctx, "subscribing single client to documents (autosubscription)",
				"account_id", accountID,
				"collection", subscriptionRequest.Collection,
				"doc_ids", subscriptionRequest.DocIDs,
				"collection_scoped_doc_ids", collectionScopedDocIDs)
			// Subscribe only the first available client (autosubscription applies to requesting client only)
			for _, docID := range collectionScopedDocIDs {
				s.SubscribeSingleClientToDocument(accountID, docID)
			}
		} else {
			logs.WarnCtx(ctx, "subscription request has no docIDs",
				"account_id", accountID,
				"collection", subscriptionRequest.Collection)
		}

		// Acknowledge message
		deliveryCount := natscore.GetDeliveryCount(msg)
		natscore.AcknowledgeMessage(msg, "subscription processed", deliveryCount)
		logs.InfoCtx(ctx, "doc subscribe message processed",
			"account_id", accountID,
			"collection", subscriptionRequest.Collection,
			"doc_count", len(subscriptionRequest.DocIDs))
	}

	// Start message processing loop
	stopChan := make(chan struct{})
	go func() {
		<-s.shutdownChan
		close(stopChan)
	}()

	// Use the helper function from internal/core/nats
	natscore.StartMessageProcessingLoop(
		consumer,
		processor,
		stopChan,
		"doc.subscribe.>",
	)

	logs.DebugCtx(ctx, "subscribed to document subscription requests",
		"subject", "doc.subscribe.>",
		"consumer", "doc-subscribe-consumer")
}
