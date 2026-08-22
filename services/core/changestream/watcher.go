package changestream

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"reflect"
	"strings"
	"sync"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/wsplacement"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const changestreamLogComponent = "changestream"

// changeStreamMaxAwaitTime bounds how long the server holds a getMore before returning an
// empty batch. Expiry leaves the cursor valid, so it is also how often an idle watch loop
// regains control.
const changeStreamMaxAwaitTime = 30 * time.Second

// ScopesPayload narrows websocket fan-out under alliance/corporation roots (optional metadata).
type ScopesPayload struct {
	CorporationRefs []string `json:"corporationRefs,omitempty"`
	AccountIDs      []string `json:"accountIDs,omitempty"`
}

// ChangeStreamMessage represents the message payload sent to NATS
type ChangeStreamMessage struct {
	Subject                 string         `json:"subject"`
	Collection              string         `json:"collection"`
	DocID                   string         `json:"docID"`
	OperationType           string         `json:"operationType"`
	SourceClientID          string         `json:"sourceClientID,omitempty"`  // ClientID that originated the change (for filtering)
	SourceSessionID         string         `json:"sourceSessionID,omitempty"` // SessionID that originated the change (stable across client reconnects)
	AccountID               string         `json:"accountID,omitempty"`       // AccountID for INSERT operations (broadcast to all account clients)
	CorporationRef          string         `json:"corporationRef,omitempty"`  // Org routing when accountID is absent (see websocket dispatch)
	AllianceRef             string         `json:"allianceRef,omitempty"`
	Scopes                  *ScopesPayload `json:"scopes,omitempty"`
	Document                map[string]any `json:"document,omitempty"`
	PreviousDocument        map[string]any `json:"previousDocument,omitempty"`
	RefreshTokensChanged    bool           `json:"refreshTokensChanged,omitempty"`
	LinkedCharactersChanged bool           `json:"linkedCharactersChanged,omitempty"`
	ChangeEvent             map[string]any `json:"changeEvent,omitempty"`
}

// Watcher watches MongoDB change streams and publishes changes to NATS.
type Watcher struct {
	mongo     *eipmongo.Mongo
	jsContext jetstream.JetStream
	natsConn  *natslib.Conn
	rdb       *redis.Client
	database  *mongo.Database
}

// NewWatcher creates a new change stream watcher. rdb may be nil (cold start only).
func NewWatcher(mongoHandle *eipmongo.Mongo, jsContext jetstream.JetStream, natsConn *natslib.Conn, rdb *redis.Client) *Watcher {
	var database *mongo.Database
	if mongoHandle != nil {
		database = mongoHandle.DB
	}
	return &Watcher{
		mongo:     mongoHandle,
		jsContext: jsContext,
		natsConn:  natsConn,
		rdb:       rdb,
		database:  database,
	}
}

// Start begins watching MongoDB change streams (one goroutine per collection group).
// The returned stop cancels the watch context so Next aborts on lose-primary.
func (w *Watcher) Start(groups []CollectionGroup) func() {
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	for _, g := range groups {
		wg.Add(1)
		go func(group CollectionGroup) {
			defer wg.Done()
			w.watchCollectionGroup(ctx, group)
		}(g)
	}
	var once sync.Once
	return func() {
		once.Do(func() {
			cancel()
			done := make(chan struct{})
			go func() {
				wg.Wait()
				close(done)
			}()
			select {
			case <-done:
			case <-time.After(30 * time.Second):
				logs.WarnCtx(context.Background(), "changestream stop timed out waiting for group loops",
					"component", changestreamLogComponent)
			}
		})
	}
}

func sleepOrDone(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

// watchCollectionGroup watches the database change stream filtered to one group's collections.
func (w *Watcher) watchCollectionGroup(streamCtx context.Context, group CollectionGroup) {
	logs.InfoCtx(streamCtx, "starting MongoDB change stream watcher for collection group",
		"component", changestreamLogComponent,
		"group_id", group.ID,
		"collections", group.Collections,
		"database", eipmongo.DatabaseName)

	reconnectCount := 0
	pipeline := MatchPipelineForCollections(group.Collections)
	for {
		if err := streamCtx.Err(); err != nil {
			logs.InfoCtx(streamCtx, "change stream watcher stopped for collection group",
				"component", changestreamLogComponent,
				"group_id", group.ID,
				"reconnects", reconnectCount)
			return
		}

		ctx, cancel := context.WithCancel(streamCtx)

		opts := options.ChangeStream().
			SetFullDocument(options.UpdateLookup).
			SetFullDocumentBeforeChange(options.WhenAvailable).
			SetMaxAwaitTime(changeStreamMaxAwaitTime)

		if token, ok := loadResumeToken(ctx, w.rdb, group.ID); ok {
			opts.SetStartAfter(token)
			logs.InfoCtx(ctx, "change stream resuming with StartAfter token",
				"component", changestreamLogComponent, "group_id", group.ID)
		}

		changeStream, err := w.database.Watch(ctx, pipeline, opts)
		if err != nil {
			cancel()
			if isInvalidResumeError(err) {
				logs.WarnCtx(streamCtx, "change stream resume invalid; clearing token and cold start",
					"component", changestreamLogComponent, "group_id", group.ID, "error", err)
				clearResumeToken(streamCtx, w.rdb, group.ID)
				continue
			}
			if streamCtx.Err() != nil {
				return
			}
			reconnectCount++
			logs.ErrorCtx(streamCtx, "failed to create change stream, will retry",
				"component", changestreamLogComponent,
				"group_id", group.ID,
				"error", err,
				"reconnect_attempt", reconnectCount)
			if !sleepOrDone(streamCtx, 5*time.Second) {
				return
			}
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
				"database", eipmongo.DatabaseName)
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

			procErr := w.processChangeEvent(ctx, changeEvent)
			if procErr != nil {
				logs.WarnCtx(ctx, "failed to process change event", "component", changestreamLogComponent, "group_id", group.ID, "error", procErr, "event_count", eventCount)
				continue
			}
			// Advance cursor after publish success or intentional skip (prefer dup over miss).
			if token, err := resumeTokenFromEvent(changeEvent); err != nil {
				logs.WarnCtx(ctx, "change event missing resume token",
					"component", changestreamLogComponent, "group_id", group.ID, "error", err)
			} else {
				saveResumeToken(ctx, w.rdb, group.ID, token)
			}
		}

		streamErr := changeStream.Err()
		_ = changeStream.Close(ctx)
		cancel()

		if eventCount > 0 {
			logs.InfoCtx(streamCtx, "change stream iteration completed", "component", changestreamLogComponent, "group_id", group.ID, "events_processed", eventCount)
		}

		if streamCtx.Err() != nil {
			return
		}

		if streamErr != nil {
			if isInvalidResumeError(streamErr) {
				logs.WarnCtx(streamCtx, "change stream history lost; clearing resume token",
					"component", changestreamLogComponent, "group_id", group.ID, "error", streamErr)
				clearResumeToken(streamCtx, w.rdb, group.ID)
			} else {
				logs.WarnCtx(streamCtx, "change stream error, will reconnect",
					"component", changestreamLogComponent,
					"group_id", group.ID,
					"error", streamErr,
					"events_processed", eventCount)
			}
			if !sleepOrDone(streamCtx, 5*time.Second) {
				return
			}
			continue
		}

		logs.InfoCtx(streamCtx, "change stream closed, reconnecting...", "component", changestreamLogComponent, "group_id", group.ID, "events_processed", eventCount)
		if !sleepOrDone(streamCtx, 2*time.Second) {
			return
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
	var document map[string]any
	var sourceClientID string
	var sourceSessionID string
	var accountID string

	// For DELETE operations, try to get fullDocumentBeforeChange (requires collection
	// changeStreamPreAndPostImages — ensured by deployment-tool PreimageCollections / EnsureMongo).
	// For other operations, use fullDocument.
	var docToExtract bson.M
	if operationType == "delete" {
		docToExtract = subDocumentToMap(changeEvent["fullDocumentBeforeChange"])
	} else {
		docToExtract = subDocumentToMap(changeEvent["fullDocument"])
	}

	if docToExtract != nil {
		document = make(map[string]any)
		maps.Copy(document, docToExtract)

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
	// changeStreamPreAndPostImages (deployment-tool PreimageCollections / EnsureMongo). Without that,
	// AccountID stays empty → websocket dispatch skips account broadcast (unless clients
	// explicitly subscribed). Singleton account docs use Mongo _id === account id string.
	if accountID == "" && operationType == "delete" {
		switch collection {
		case eipmongo.CollectionUsers, eipmongo.CollectionApplicationSettings, eipmongo.CollectionUserWatchlistDeprecated:
			accountID = docID
		default:
			if collection == eipmongo.CollectionUserJobGroups ||
				collection == eipmongo.CollectionUserJobDocuments {
				logs.WarnCtx(ctx, "delete missing accountID on collection (fullDocumentBeforeChange empty);"+
					" websocket account fan-out skipped — enable changeStreamPreAndPostImages"+
					" (eip ensure-mongo / deployment-tool PreimageCollections)",
					"component", changestreamLogComponent,
					"collection", collection,
					"doc_id", docID,
					"full_document_before_change_status", changeStreamDocFieldStatus(changeEvent, "fullDocumentBeforeChange"))
			}
		}
	}

	var previousDocument map[string]any
	var previousDocToExtract bson.M
	if operationType == "update" || operationType == "replace" {
		previousDocToExtract = subDocumentToMap(changeEvent["fullDocumentBeforeChange"])
	}

	switch collection {
	case eipmongo.CollectionUsers, eipmongo.CollectionApplicationSettings, eipmongo.CollectionUserWatchlistDeprecated:
		if operationType == "update" || operationType == "replace" {
			if previousDocToExtract != nil {
				previousDocument = make(map[string]any, len(previousDocToExtract))
				maps.Copy(previousDocument, previousDocToExtract)
			}
		}
	}
	refreshTokensChanged := false
	linkedCharactersChanged := false
	if collection == eipmongo.CollectionUsers {
		refreshTokensChanged = usersRefreshTokensChanged(operationType, docToExtract, previousDocToExtract)
		linkedCharactersChanged = usersRefreshTokenCharacterHashesChanged(operationType, docToExtract, previousDocToExtract)
		stripUsersRefreshTokenFields(document)
		stripUsersRefreshTokenFields(previousDocument)
		// Client no longer needs previous users-doc payload; it relies on change flags
		// plus dedicated token endpoint reads for linked-character reconciliation.
		previousDocument = nil
	} else if collection == eipmongo.CollectionApplicationSettings {
		// Application settings reconcile uses the current authoritative document only.
		previousDocument = nil
	}

	corpID, allianceRef, scopePayload := extractOrgRoutingFromDocument(docToExtract)

	tenantString := wsplacement.TenantStringFromRouting(accountID, corpID, allianceRef)
	subject := natscore.DocUpdateSubject(tenantString, collection, docID)
	if subject == "" {
		logs.WarnCtx(ctx, "change stream event skipped: no tenant for doc.update subject",
			"component", changestreamLogComponent,
			"operation", operationType,
			"collection", collection,
			"doc_id", docID,
			"account_id", accountID,
			"corporation_ref", corpID,
			"alliance_ref", allianceRef)
		return nil
	}

	// Create message payload
	message := ChangeStreamMessage{
		Subject:                 subject,
		Collection:              collection,
		DocID:                   docID,
		OperationType:           operationType,
		SourceClientID:          sourceClientID,
		SourceSessionID:         sourceSessionID,
		AccountID:               accountID,
		CorporationRef:          corpID,
		AllianceRef:             allianceRef,
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
			"tenant", tenantString,
			"error", err)
		return fmt.Errorf("failed to publish change stream message: %w", err)
	}

	logs.InfoCtx(ctx, "change stream event published to NATS",
		"component", changestreamLogComponent,
		"operation", operationType,
		"collection", collection,
		"doc_id", docID,
		"subject", subject,
		"tenant", tenantString,
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

func hasRemovedFields(raw any) bool {
	if raw == nil {
		return false
	}
	switch v := raw.(type) {
	case bson.A:
		return len(v) > 0
	case []any:
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

	var rows []any
	switch v := field.(type) {
	case bson.A:
		rows = []any(v)
	case []any:
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

func usersRefreshTokensField(doc bson.M) any {
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

func stripUsersRefreshTokenFields(doc map[string]any) {
	if doc == nil {
		return
	}
	delete(doc, "refreshTokens")
	delete(doc, "refresh_tokens")
}

func extractOrgRoutingFromDocument(doc bson.M) (corpID, allianceRef string, scopes *ScopesPayload) {
	if doc == nil {
		return "", "", nil
	}
	meta := subDocumentToMap(doc["_meta"])
	corpID = docFieldString(doc, meta, models.MetaFieldCorporationRef)
	allianceRef = docFieldString(doc, meta, models.MetaFieldAllianceRef)
	if sp := scopesFromDocOrMeta(doc, meta); sp != nil && (len(sp.CorporationRefs) > 0 || len(sp.AccountIDs) > 0) {
		scopes = sp
	}
	return corpID, allianceRef, scopes
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

func bsonValueToString(v any) string {
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
	cids := bsonArrayToStrings(raw["corporationRefs"])
	aids := bsonArrayToStrings(raw["accountIDs"])
	if len(cids) == 0 && len(aids) == 0 {
		return nil
	}
	return &ScopesPayload{CorporationRefs: cids, AccountIDs: aids}
}

func asBsonM(v any) bson.M {
	switch m := v.(type) {
	case bson.M:
		return m
	case map[string]any:
		return bson.M(m)
	default:
		return nil
	}
}

func bsonArrayToStrings(v any) []string {
	if v == nil {
		return nil
	}
	var elems []any
	switch t := v.(type) {
	case bson.A:
		elems = []any(t)
	case []any:
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
// Returns a stop function for graceful shutdown. rdb stores per-group resume tokens (optional).
func StartService(mongoHandle *eipmongo.Mongo, jsContext jetstream.JetStream, natsConn *natslib.Conn, rdb *redis.Client) (func(), error) {
	groups := CollectionGroups()
	if err := validateCollectionGroups(groups); err != nil {
		return nil, err
	}
	watcher := NewWatcher(mongoHandle, jsContext, natsConn, rdb)
	return watcher.Start(groups), nil
}
