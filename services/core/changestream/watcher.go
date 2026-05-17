package changestream

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const changestreamLogComponent = "changestream"

// ScopesPayload narrows websocket fan-out under alliance/corporation roots (optional metadata).
type ScopesPayload struct {
	CorporationIDs []string `json:"corporationIDs,omitempty"`
	AccountIDs     []string `json:"accountIDs,omitempty"`
}

// ChangeStreamMessage represents the message payload sent to NATS
type ChangeStreamMessage struct {
	Subject                 string                 `json:"subject"`
	Collection              string                 `json:"collection"`
	DocID                   string                 `json:"docID"`
	OperationType           string                 `json:"operationType"`
	SourceClientID          string                 `json:"sourceClientID,omitempty"`  // ClientID that originated the change (for filtering)
	SourceSessionID         string                 `json:"sourceSessionID,omitempty"` // SessionID that originated the change (stable across client reconnects)
	AccountID               string                 `json:"accountID,omitempty"`       // AccountID for INSERT operations (broadcast to all account clients)
	CorporationID           string                 `json:"corporationID,omitempty"`   // Org routing when accountID is absent (see websocket dispatch)
	AllianceID              string                 `json:"allianceID,omitempty"`
	Scopes                  *ScopesPayload         `json:"scopes,omitempty"`
	Document                map[string]interface{} `json:"document,omitempty"`
	PreviousDocument        map[string]interface{} `json:"previousDocument,omitempty"`
	RefreshTokensChanged    bool                   `json:"refreshTokensChanged,omitempty"`
	LinkedCharactersChanged bool                   `json:"linkedCharactersChanged,omitempty"`
	ChangeEvent             map[string]interface{} `json:"changeEvent,omitempty"`
}

// Watcher watches MongoDB change streams and publishes changes to NATS
type Watcher struct {
	mongoClient *mongo.Client
	jsContext   jetstream.JetStream
	natsConn    *natslib.Conn
	database    *mongo.Database
	stopChan    chan struct{}
}

// NewWatcher creates a new change stream watcher
func NewWatcher(mongoClient *mongo.Client, jsContext jetstream.JetStream, natsConn *natslib.Conn) *Watcher {
	return &Watcher{
		mongoClient: mongoClient,
		jsContext:   jsContext,
		natsConn:    natsConn,
		database:    mongoClient.Database(mongocore.DatabaseName),
		stopChan:    make(chan struct{}),
	}
}

// Start begins watching MongoDB change streams (one goroutine per collection group; see CollectionGroups).
// Returns a stop function that waits for all group loops to exit.
func (w *Watcher) Start(groups []CollectionGroup) func() {
	streamCtx := context.Background()
	var wg sync.WaitGroup
	for _, g := range groups {
		wg.Add(1)
		go func(group CollectionGroup) {
			defer wg.Done()
			w.watchCollectionGroup(streamCtx, group)
		}(g)
	}
	return func() {
		close(w.stopChan)
		wg.Wait()
	}
}

// watchCollectionGroup watches the database change stream filtered to one group's collections (ns.coll $in ...).
func (w *Watcher) watchCollectionGroup(streamCtx context.Context, group CollectionGroup) {
	logs.InfoCtx(streamCtx, "starting MongoDB change stream watcher for collection group",
		"component", changestreamLogComponent,
		"group_id", group.ID,
		"collections", group.Collections,
		"database", mongocore.DatabaseName)

	reconnectCount := 0
	pipeline := MatchPipelineForCollections(group.Collections)
	for {
		select {
		case <-w.stopChan:
			logs.InfoCtx(streamCtx, "change stream watcher stopped for collection group",
				"component", changestreamLogComponent,
				"group_id", group.ID,
				"reconnects", reconnectCount)
			return
		default:
			ctx, cancel := context.WithCancel(streamCtx)

			opts := options.ChangeStream().
				SetFullDocument(options.UpdateLookup).
				SetFullDocumentBeforeChange(options.WhenAvailable)

			changeStream, err := w.database.Watch(ctx, pipeline, opts)
			if err != nil {
				reconnectCount++
				logs.ErrorCtx(ctx, "failed to create change stream, will retry",
					"component", changestreamLogComponent,
					"group_id", group.ID,
					"error", err,
					"reconnect_attempt", reconnectCount)
				cancel()
				time.Sleep(5 * time.Second)
				continue
			}

			if reconnectCount > 0 {
				logs.InfoCtx(ctx, "change stream reconnected successfully",
					"component", changestreamLogComponent,
					"group_id", group.ID,
					"reconnect_count", reconnectCount)
				reconnectCount = 0
			} else {
				logs.DebugCtx(ctx, "change stream created, watching for changes",
					"component", changestreamLogComponent,
					"group_id", group.ID,
					"database", mongocore.DatabaseName)
			}

			eventCount := 0
			for changeStream.Next(ctx) {
				eventCount++
				var changeEvent bson.M
				if err := changeStream.Decode(&changeEvent); err != nil {
					logs.WarnCtx(ctx, "failed to decode change event", "component", changestreamLogComponent, "group_id", group.ID, "error", err, "event_count", eventCount)
					continue
				}

				if operationType, ok := changeEvent["operationType"].(string); ok {
					if ns, ok := changeEvent["ns"].(bson.M); ok {
						if collection, ok := ns["coll"].(string); ok {
							logs.DebugCtx(ctx, "change stream event received",
								"component", changestreamLogComponent,
								"group_id", group.ID,
								"operation", operationType,
								"collection", collection,
								"event_count", eventCount)
						}
					}
				}

				if err := w.processChangeEvent(ctx, changeEvent); err != nil {
					logs.WarnCtx(ctx, "failed to process change event", "component", changestreamLogComponent, "group_id", group.ID, "error", err, "event_count", eventCount)
				}
			}

			if eventCount > 0 {
				logs.InfoCtx(ctx, "change stream iteration completed", "component", changestreamLogComponent, "group_id", group.ID, "events_processed", eventCount)
			}

			if err := changeStream.Err(); err != nil {
				logs.WarnCtx(ctx, "change stream error, will reconnect",
					"component", changestreamLogComponent,
					"group_id", group.ID,
					"error", err,
					"events_processed", eventCount)
				if err := changeStream.Close(ctx); err != nil {
					logs.WarnCtx(ctx, "error closing change stream", "component", changestreamLogComponent, "group_id", group.ID, "error", err)
				}
				cancel()
				time.Sleep(5 * time.Second)
				continue
			}

			if err := changeStream.Close(ctx); err != nil {
				logs.WarnCtx(ctx, "error closing change stream", "component", changestreamLogComponent, "group_id", group.ID, "error", err)
			}
			cancel()
			logs.InfoCtx(ctx, "change stream closed, reconnecting...", "component", changestreamLogComponent, "group_id", group.ID, "events_processed", eventCount)
			time.Sleep(2 * time.Second)
		}
	}
}

// processChangeEvent processes a single change event and publishes it to NATS
func (w *Watcher) processChangeEvent(ctx context.Context, changeEvent bson.M) error {
	// Extract operation type
	operationType, ok := changeEvent["operationType"].(string)
	if !ok {
		return fmt.Errorf("missing or invalid operationType")
	}

	// Extract namespace (database.collection)
	ns, ok := changeEvent["ns"].(bson.M)
	if !ok {
		return fmt.Errorf("missing namespace in change event")
	}

	collection, ok := ns["coll"].(string)
	if !ok {
		return fmt.Errorf("missing collection name in namespace")
	}

	if isSchemaMaintenanceOnlyUpdate(changeEvent, operationType) {
		logs.DebugCtx(ctx, "skipping schema-version-only maintenance change event",
			"component", changestreamLogComponent,
			"collection", collection,
			"operation", operationType)
		return nil
	}

	// Extract document key (_id)
	documentKey, ok := changeEvent["documentKey"].(bson.M)
	if !ok {
		return fmt.Errorf("missing documentKey in change event")
	}

	docIDValue, ok := documentKey["_id"]
	if !ok {
		return fmt.Errorf("missing _id in documentKey")
	}

	// Convert docID to string
	var docID string
	switch v := docIDValue.(type) {
	case string:
		docID = v
	case int32, int64:
		docID = fmt.Sprintf("%d", v)
	case float64:
		docID = fmt.Sprintf("%.0f", v)
	default:
		docID = fmt.Sprintf("%v", v)
	}

	// Extract full document if available
	var document map[string]interface{}
	var sourceClientID string
	var sourceSessionID string
	var accountID string

	// For DELETE operations, try to get fullDocumentBeforeChange (requires collection
	// changeStreamPreAndPostImages — see mongo indexing for user_job_groups).
	// For other operations, use fullDocument.
	var docToExtract bson.M
	if operationType == "delete" {
		docToExtract = subDocumentToMap(changeEvent["fullDocumentBeforeChange"])
	} else {
		docToExtract = subDocumentToMap(changeEvent["fullDocument"])
	}

	if docToExtract != nil {
		document = make(map[string]interface{})
		for k, v := range docToExtract {
			document[k] = v
		}

		meta := subDocumentToMap(docToExtract["_meta"])
		if meta != nil {
			if clientID, ok := meta["clientID"].(string); ok && clientID != "" {
				sourceClientID = clientID
			}
			if sessionID, ok := meta["sessionID"].(string); ok && sessionID != "" {
				sourceSessionID = sessionID
			}
		}

		// Prefer root accountID (e.g. groups), then _meta.accountID (jobs, groups).
		if accID, ok := docToExtract["accountID"].(string); ok && accID != "" {
			accountID = accID
		}
		if accountID == "" && meta != nil {
			if accID, ok := meta["accountID"].(string); ok && accID != "" {
				accountID = accID
			}
		}
	}

	// DELETE events only populate fullDocumentBeforeChange when the collection has
	// changeStreamPreAndPostImages (Mongo bootstrap / admin collMod). Without that, AccountID stays
	// empty → websocket dispatch skips account broadcast (unless clients explicitly subscribed).
	// Singleton account docs use Mongo _id === account id string.
	if accountID == "" && operationType == "delete" {
		switch collection {
		case mongocore.CollectionUsers, mongocore.CollectionApplicationSettings, mongocore.CollectionUserWatchlistDeprecated:
			accountID = docID
		default:
			if collection == mongocore.CollectionUserJobGroups ||
				collection == mongocore.CollectionUserJobDocuments {
				logs.WarnCtx(ctx, "delete missing accountID on collection (fullDocumentBeforeChange empty);"+
					" websocket account fan-out skipped — enable changeStreamPreAndPostImages for this collection"+
					" (see scripts/mongo-setup.sh CHANGE_STREAM_PREIMAGE_COLLECTIONS or admin collMod)",
					"component", changestreamLogComponent,
					"collection", collection,
					"doc_id", docID,
					"full_document_before_change_status", changeStreamDocFieldStatus(changeEvent, "fullDocumentBeforeChange"))
			}
		}
	}

	var previousDocument map[string]interface{}
	var previousDocToExtract bson.M
	if operationType == "update" || operationType == "replace" {
		previousDocToExtract = subDocumentToMap(changeEvent["fullDocumentBeforeChange"])
	}

	switch collection {
	case mongocore.CollectionUsers, mongocore.CollectionApplicationSettings, mongocore.CollectionUserWatchlistDeprecated:
		if operationType == "update" || operationType == "replace" {
			if previousDocToExtract != nil {
				previousDocument = make(map[string]interface{}, len(previousDocToExtract))
				for k, v := range previousDocToExtract {
					previousDocument[k] = v
				}
			}
		}
	}
	refreshTokensChanged := false
	linkedCharactersChanged := false
	if collection == mongocore.CollectionUsers {
		refreshTokensChanged = usersRefreshTokensChanged(operationType, docToExtract, previousDocToExtract)
		linkedCharactersChanged = usersRefreshTokenCharacterHashesChanged(operationType, docToExtract, previousDocToExtract)
		stripUsersRefreshTokenFields(document)
		stripUsersRefreshTokenFields(previousDocument)
		// Client no longer needs previous users-doc payload; it relies on change flags
		// plus dedicated token endpoint reads for linked-character reconciliation.
		previousDocument = nil
	} else if collection == mongocore.CollectionApplicationSettings {
		// Application settings reconcile uses the current authoritative document only.
		previousDocument = nil
	}

	// Create NATS subject: doc.update.{collection}.{docID}
	subject := fmt.Sprintf("%s.%s.%s", natscore.SubjectDocUpdate, collection, docID)

	corpID, allianceID, scopePayload := extractOrgRoutingFromDocument(docToExtract)

	// Create message payload
	message := ChangeStreamMessage{
		Subject:                 subject,
		Collection:              collection,
		DocID:                   docID,
		OperationType:           operationType,
		SourceClientID:          sourceClientID,
		SourceSessionID:         sourceSessionID,
		AccountID:               accountID,
		CorporationID:           corpID,
		AllianceID:              allianceID,
		Scopes:                  scopePayload,
		Document:                document,
		PreviousDocument:        previousDocument,
		RefreshTokensChanged:    refreshTokensChanged,
		LinkedCharactersChanged: linkedCharactersChanged,
	}

	// Marshal to JSON
	messageData, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal change stream message: %w", err)
	}

	// Publish to NATS (JetStream for persistence + optional offline replay)
	if err := natscore.PublishMessage(ctx, w.jsContext, subject, messageData, w.natsConn); err != nil {
		logs.ErrorCtx(ctx, "failed to publish change stream message to NATS",
			"component", changestreamLogComponent,
			"operation", operationType,
			"collection", collection,
			"doc_id", docID,
			"subject", subject,
			"error", err)
		return fmt.Errorf("failed to publish change stream message: %w", err)
	}

	logs.InfoCtx(ctx, "change stream event published to NATS",
		"component", changestreamLogComponent,
		"operation", operationType,
		"collection", collection,
		"doc_id", docID,
		"subject", subject,
		"source_client_id", sourceClientID,
		"source_session_id", sourceSessionID,
		"account_id", accountID,
		"has_document", document != nil,
		"has_previous_document", previousDocument != nil,
		"full_document_status", changeStreamDocFieldStatus(changeEvent, "fullDocument"),
		"full_document_before_change_status", changeStreamDocFieldStatus(changeEvent, "fullDocumentBeforeChange"))

	return nil
}

func isSchemaMaintenanceOnlyUpdate(changeEvent bson.M, operationType string) bool {
	if operationType != "update" {
		return false
	}
	updateDescription := subDocumentToMap(changeEvent["updateDescription"])
	if updateDescription == nil {
		return false
	}
	updatedFields := subDocumentToMap(updateDescription["updatedFields"])
	if len(updatedFields) == 0 {
		return false
	}
	if hasRemovedFields(updateDescription["removedFields"]) {
		return false
	}
	for field := range updatedFields {
		if !isAllowedSchemaMaintenanceField(field) {
			return false
		}
	}
	_, hasSchemaVersion := updatedFields["schemaVersion"]
	_, hasSnakeSchemaVersion := updatedFields["schema_version"]
	return hasSchemaVersion || hasSnakeSchemaVersion
}

func hasRemovedFields(raw interface{}) bool {
	if raw == nil {
		return false
	}
	switch v := raw.(type) {
	case bson.A:
		return len(v) > 0
	case []interface{}:
		return len(v) > 0
	default:
		return true
	}
}

func isAllowedSchemaMaintenanceField(field string) bool {
	switch field {
	case "schemaVersion",
		"schema_version",
		"_meta.lastModified",
		"_meta.last_modified",
		"lastModified",
		"last_modified":
		return true
	default:
		return false
	}
}

func usersRefreshTokenCharacterHashesChanged(operationType string, currentDoc bson.M, previousDoc bson.M) bool {
	switch operationType {
	case "insert":
		return len(usersRefreshTokenCharacterHashSet(currentDoc)) > 0
	case "delete":
		return len(usersRefreshTokenCharacterHashSet(previousDoc)) > 0
	case "update", "replace":
		return !equalStringSets(
			usersRefreshTokenCharacterHashSet(currentDoc),
			usersRefreshTokenCharacterHashSet(previousDoc),
		)
	default:
		return false
	}
}

func usersRefreshTokensChanged(operationType string, currentDoc bson.M, previousDoc bson.M) bool {
	switch operationType {
	case "insert":
		return usersRefreshTokensField(currentDoc) != nil
	case "delete":
		return usersRefreshTokensField(previousDoc) != nil
	case "update", "replace":
		return !reflect.DeepEqual(usersRefreshTokensField(currentDoc), usersRefreshTokensField(previousDoc))
	default:
		return false
	}
}

func usersRefreshTokenCharacterHashSet(doc bson.M) map[string]struct{} {
	field := usersRefreshTokensField(doc)
	if field == nil {
		return map[string]struct{}{}
	}

	var rows []interface{}
	switch v := field.(type) {
	case bson.A:
		rows = []interface{}(v)
	case []interface{}:
		rows = v
	default:
		return map[string]struct{}{}
	}

	out := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		m := subDocumentToMap(row)
		if m == nil {
			continue
		}
		hash := strings.TrimSpace(docFieldString(m, nil, "characterHash", "CharacterHash", "character_hash"))
		if hash == "" {
			continue
		}
		out[strings.ToLower(hash)] = struct{}{}
	}
	return out
}

func equalStringSets(a, b map[string]struct{}) bool {
	if len(a) != len(b) {
		return false
	}
	for k := range a {
		if _, ok := b[k]; !ok {
			return false
		}
	}
	return true
}

func usersRefreshTokensField(doc bson.M) interface{} {
	if doc == nil {
		return nil
	}
	if v, ok := doc["refreshTokens"]; ok {
		return v
	}
	if v, ok := doc["refresh_tokens"]; ok {
		return v
	}
	return nil
}

func stripUsersRefreshTokenFields(doc map[string]interface{}) {
	if doc == nil {
		return
	}
	delete(doc, "refreshTokens")
	delete(doc, "refresh_tokens")
}

func extractOrgRoutingFromDocument(doc bson.M) (corpID, allianceID string, scopes *ScopesPayload) {
	if doc == nil {
		return "", "", nil
	}
	meta := subDocumentToMap(doc["_meta"])
	corpID = docFieldString(doc, meta, "corporationID", "corporationId")
	allianceID = docFieldString(doc, meta, "allianceID", "allianceId")
	if sp := scopesFromDocOrMeta(doc, meta); sp != nil && (len(sp.CorporationIDs) > 0 || len(sp.AccountIDs) > 0) {
		scopes = sp
	}
	return corpID, allianceID, scopes
}

func docFieldString(doc, meta bson.M, keys ...string) string {
	for _, k := range keys {
		if doc != nil {
			if v, ok := doc[k]; ok {
				if s := bsonValueToString(v); s != "" {
					return s
				}
			}
		}
		if meta != nil {
			if v, ok := meta[k]; ok {
				if s := bsonValueToString(v); s != "" {
					return s
				}
			}
		}
	}
	return ""
}

func bsonValueToString(v interface{}) string {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case int32:
		return fmt.Sprintf("%d", t)
	case int64:
		return fmt.Sprintf("%d", t)
	case float64:
		return fmt.Sprintf("%.0f", t)
	default:
		return strings.TrimSpace(fmt.Sprint(t))
	}
}

func scopesFromDocOrMeta(doc, meta bson.M) *ScopesPayload {
	var raw bson.M
	if meta != nil {
		raw = asBsonM(meta["scopes"])
	}
	if raw == nil {
		raw = asBsonM(doc["scopes"])
	}
	if raw == nil {
		return nil
	}
	cids := bsonArrayToStrings(raw["corporationIDs"])
	aids := bsonArrayToStrings(raw["accountIDs"])
	if len(cids) == 0 && len(aids) == 0 {
		return nil
	}
	return &ScopesPayload{CorporationIDs: cids, AccountIDs: aids}
}

func asBsonM(v interface{}) bson.M {
	switch m := v.(type) {
	case bson.M:
		return m
	case map[string]interface{}:
		return bson.M(m)
	default:
		return nil
	}
}

func bsonArrayToStrings(v interface{}) []string {
	if v == nil {
		return nil
	}
	var elems []interface{}
	switch t := v.(type) {
	case bson.A:
		elems = []interface{}(t)
	case []interface{}:
		elems = t
	default:
		return nil
	}
	out := make([]string, 0, len(elems))
	for _, el := range elems {
		if s := bsonValueToString(el); s != "" {
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// StartService starts the MongoDB change stream watcher service (parallel watches per CollectionGroups entry).
// Returns a stop function for graceful shutdown.
func StartService(mongoSecondaryClient *mongo.Client, jsContext jetstream.JetStream, natsConn *natslib.Conn) (func(), error) {
	groups := CollectionGroups()
	if err := validateCollectionGroups(groups); err != nil {
		return nil, err
	}
	watcher := NewWatcher(mongoSecondaryClient, jsContext, natsConn)
	return watcher.Start(groups), nil
}
