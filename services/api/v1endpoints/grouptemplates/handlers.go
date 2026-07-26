package grouptemplates

import (
	"context"
	"errors"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func catalogCollection(clients *stackservices.Clients) *mongo.Collection {
	return clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUserGroupTemplateCatalog)
}

func payloadCollection(clients *stackservices.Clients) *mongo.Collection {
	return clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUserGroupTemplatePayloads)
}

type catalogStored struct {
	ID             string                        `bson:"_id"`
	SchemaVersion  int                           `bson:"schemaVersion"`
	DocumentKind   string                        `bson:"documentKind"`
	AccountID      string                        `bson:"accountID"`
	CatalogVersion int64                         `bson:"catalogVersion"`
	Templates      []models.TemplateCatalogEntry `bson:"templates"`
}

func runMongoRetry(ctx context.Context, operationName string, operation func() error) error {
	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = operationName
	return mongocore.RetryMongoOperation(ctx, retryCfg, operation)
}

func loadCatalogDoc(ctx context.Context, coll *mongo.Collection, accountID string) (*catalogStored, error) {
	var doc catalogStored
	err := runMongoRetry(ctx, fmt.Sprintf("group_templates load catalog %s", accountID), func() error {
		return coll.FindOne(ctx, bson.M{"_id": accountID}).Decode(&doc)
	})
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

func ensureCatalogDoc(ctx context.Context, coll *mongo.Collection, accountID string) (*catalogStored, error) {
	doc, err := loadCatalogDoc(ctx, coll, accountID)
	if err == nil {
		return doc, nil
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, err
	}
	initial := catalogStored{
		ID:             accountID,
		SchemaVersion:  models.GroupTemplateCatalogSchemaVersion,
		DocumentKind:   models.GroupTemplateCatalogDocumentKind,
		AccountID:      accountID,
		CatalogVersion: 1,
		Templates:      []models.TemplateCatalogEntry{},
	}
	err = runMongoRetry(ctx, fmt.Sprintf("group_templates ensure catalog %s", accountID), func() error {
		_, insertErr := coll.InsertOne(ctx, initial)
		return insertErr
	})
	if err != nil {
		// Race: another request may have created it.
		if mongo.IsDuplicateKeyError(err) {
			return loadCatalogDoc(ctx, coll, accountID)
		}
		return nil, err
	}
	initial.Templates = []models.TemplateCatalogEntry{}
	return &initial, nil
}

func beginGroupTemplateMetrics(ctx context.Context) *helper.RequestMetricsTracker {
	m := apimetrics.GetAPIGroupTemplates()
	return helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: m.Requests.Observe,
		IncRequests:     m.RequestsCount.Inc,
		IncSuccesses:    m.Successes.Inc,
		IncErrors: func(ctx context.Context, reason string) {
			m.Errors.WithLabelValues(reason).Inc(ctx)
		},
	})
}

func normalizeAndValidatePayload(payload *models.GroupTemplatePayload, templateID, accountID string) error {
	payload.TemplateID = templateID
	payload.AccountID = accountID
	payload.SchemaVersion = models.GroupTemplatePayloadSchemaVersion
	payload.DocumentKind = models.GroupTemplatePayloadDocumentKind
	return models.ValidateGroupTemplatePayload(payload)
}

func findTemplateIndex(templates []models.TemplateCatalogEntry, templateID string) int {
	for i := range templates {
		if templates[i].TemplateID == templateID {
			return i
		}
	}
	return -1
}

// GetCatalogHandler GET /api/v1/group-templates
func GetCatalogHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	ctx := r.Context()
	metrics := beginGroupTemplateMetrics(ctx)
	defer metrics.Finish()
	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodGet)
	if !ok {
		return
	}
	coll := catalogCollection(clients)
	doc, err := loadCatalogDoc(ctx, coll, accountID)
	if errors.Is(err, mongo.ErrNoDocuments) {
		_ = helper.EncodeJSON(w, map[string]any{"templates": []models.TemplateCatalogEntry{}})
		metrics.Success()
		return
	}
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to load templates", "group-templates catalog load", "group_templates_catalog_load_failed", "group_templates", err, nil)
		return
	}
	logs.AttachDebugStep(r, "mongo_query_completed", map[string]interface{}{
		"template_count": len(doc.Templates),
	})
	_ = helper.EncodeJSON(w, map[string]any{"templates": doc.Templates})
	metrics.Success()
}

// GetCatalogEntryHandler GET /api/v1/group-templates/:id
func GetCatalogEntryHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients, templateID string) {
	ctx := r.Context()
	metrics := beginGroupTemplateMetrics(ctx)
	defer metrics.Finish()
	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodGet)
	if !ok {
		return
	}
	doc, err := loadCatalogDoc(ctx, catalogCollection(clients), accountID)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			helper.RespondNotFound(w, r, metrics)
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to load catalog", "group templates catalog load by id", "group_templates_catalog_entry_failed", "group_templates", err, nil)
		return
	}
	idx := findTemplateIndex(doc.Templates, templateID)
	if idx >= 0 {
		logs.AttachDebugStep(r, "mongo_query_completed", map[string]interface{}{
			"template_id": templateID,
		})
		_ = helper.EncodeJSON(w, doc.Templates[idx])
		metrics.Success()
		return
	}
	helper.RespondNotFound(w, r, metrics)
}

// GetPayloadFullHandler GET /api/v1/group-templates/:id/full
func GetPayloadFullHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients, templateID string) {
	ctx := r.Context()
	metrics := beginGroupTemplateMetrics(ctx)
	defer metrics.Finish()
	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodGet)
	if !ok {
		return
	}
	var payload models.GroupTemplatePayload
	err := runMongoRetry(ctx, fmt.Sprintf("group_templates get payload %s", templateID), func() error {
		return payloadCollection(clients).FindOne(ctx, bson.M{"_id": templateID}).Decode(&payload)
	})
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			helper.RespondNotFound(w, r, metrics)
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to load template", "group templates payload load failed", "group_templates_payload_load_failed", "group_templates", err, nil)
		return
	}
	if payload.AccountID != accountID {
		helper.RespondNotFound(w, r, metrics)
		return
	}
	logs.AttachDebugStep(r, "mongo_query_completed", map[string]interface{}{
		"template_id": templateID,
	})
	_ = helper.EncodeJSON(w, payload)
	metrics.Success()
}

type postTemplateRequest struct {
	Name        string                      `json:"name"`
	Description string                      `json:"description"`
	TemplateID  string                      `json:"templateID"`
	Payload     models.GroupTemplatePayload `json:"payload"`
}

// PostTemplateHandler POST /api/v1/group-templates
func PostTemplateHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	ctx := r.Context()
	metrics := beginGroupTemplateMetrics(ctx)
	defer metrics.Finish()
	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodPost)
	if !ok {
		return
	}
	var body postTemplateRequest
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &body) {
		return
	}
	tid := body.TemplateID
	if tid == "" {
		tid = "tpl-" + uuid.NewString()
	}
	if err := normalizeAndValidatePayload(&body.Payload, tid, accountID); err != nil {
		metrics.Error("validation_error")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, err.Error(), "group templates validation failed", "group_templates_validation_failed", "group_templates", err, nil)
		return
	}

	catColl := catalogCollection(clients)
	payColl := payloadCollection(clients)

	cat, err := ensureCatalogDoc(ctx, catColl, accountID)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "catalog error", "group templates catalog error", "group_templates_catalog_error", "group_templates", err, nil)
		return
	}
	if len(cat.Templates) >= models.MaxTemplatesPerAccount {
		metrics.Error("template_limit_reached")
		msg := fmt.Sprintf("template limit reached (%d)", models.MaxTemplatesPerAccount)
		helper.RespondEndpointError(w, r, http.StatusConflict, msg, "group templates conflict", "group_templates_conflict", "group_templates", errors.New(msg), nil)
		return
	}

	now := time.Now().UTC()
	entry := models.BuildCatalogEntryFromPayload(tid, body.Name, body.Description, &body.Payload, now, now)
	entry.PayloadDocumentID = tid

	err = runMongoRetry(ctx, fmt.Sprintf("group_templates insert payload %s", tid), func() error {
		_, insertErr := payColl.InsertOne(ctx, bson.M{
			"_id":           tid,
			"schemaVersion": body.Payload.SchemaVersion,
			"documentKind":  body.Payload.DocumentKind,
			"accountID":     accountID,
			"templateID":    tid,
			"source":        body.Payload.Source,
			"jobs":          body.Payload.Jobs,
		})
		return insertErr
	})
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			metrics.Error("duplicate_template_id")
			const msg = "template id already exists"
			helper.RespondEndpointError(w, r, http.StatusConflict, msg, "group templates duplicate id", "group_templates_duplicate_id", "group_templates", errors.New(msg), nil)
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "failed to save payload", "group templates save payload failed", "group_templates_save_payload_failed", "group_templates", err, nil)
		return
	}

	err = runMongoRetry(ctx, fmt.Sprintf("group_templates append catalog entry %s", accountID), func() error {
		_, updateErr := catColl.UpdateOne(ctx, bson.M{"_id": accountID},
			bson.M{
				"$push": bson.M{"templates": entry},
				"$inc":  bson.M{"catalogVersion": 1},
				"$set": bson.M{
					"schemaVersion": models.GroupTemplateCatalogSchemaVersion,
					"documentKind":  models.GroupTemplateCatalogDocumentKind,
				},
			},
		)
		return updateErr
	})
	if err != nil {
		_ = runMongoRetry(ctx, fmt.Sprintf("group_templates rollback payload %s", tid), func() error {
			_, deleteErr := payColl.DeleteOne(ctx, bson.M{"_id": tid})
			return deleteErr
		})
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "failed to update catalog", "group templates update catalog failed", "group_templates_update_catalog_failed", "group_templates", err, nil)
		return
	}

	logs.AttachDebugStep(r, "template_saved", map[string]interface{}{
		"template_id": tid,
	})

	_ = helper.EncodeJSON(w, map[string]string{"templateID": tid})
	metrics.Success()
}

type patchTemplateRequest struct {
	Name        *string                      `json:"name,omitempty"`
	Description *string                      `json:"description,omitempty"`
	Payload     *models.GroupTemplatePayload `json:"payload,omitempty"`
}

// PatchTemplateHandler PATCH /api/v1/group-templates/:id
func PatchTemplateHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients, templateID string) {
	ctx := r.Context()
	metrics := beginGroupTemplateMetrics(ctx)
	defer metrics.Finish()
	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodPatch)
	if !ok {
		return
	}
	var body patchTemplateRequest
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &body) {
		return
	}
	catColl := catalogCollection(clients)
	doc, err := loadCatalogDoc(ctx, catColl, accountID)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			helper.RespondNotFound(w, r, metrics)
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "catalog error", "group templates patch catalog error", "group_templates_patch_catalog_error", "group_templates", err, nil)
		return
	}
	idx := findTemplateIndex(doc.Templates, templateID)
	if idx < 0 {
		helper.RespondNotFound(w, r, metrics)
		return
	}
	now := time.Now().UTC()
	updated := doc.Templates[idx]
	if body.Name != nil {
		updated.Name = *body.Name
	}
	if body.Description != nil {
		updated.Description = *body.Description
	}
	updated.UpdatedAt = now

	if body.Payload != nil {
		if err := normalizeAndValidatePayload(body.Payload, templateID, accountID); err != nil {
			metrics.Error("validation_error")
			helper.RespondEndpointError(w, r, http.StatusBadRequest, err.Error(), "group templates patch validation failed", "group_templates_patch_validation_failed", "group_templates", err, nil)
			return
		}
		createdAt := updated.CreatedAt
		if createdAt.IsZero() {
			createdAt = now
		}
		updated = models.BuildCatalogEntryFromPayload(templateID, updated.Name, updated.Description, body.Payload, createdAt, now)
		updated.PayloadDocumentID = templateID
		err = runMongoRetry(ctx, fmt.Sprintf("group_templates replace payload %s", templateID), func() error {
			_, replaceErr := payloadCollection(clients).ReplaceOne(ctx, bson.M{"_id": templateID, "accountID": accountID}, bson.M{
				"_id":           templateID,
				"schemaVersion": body.Payload.SchemaVersion,
				"documentKind":  body.Payload.DocumentKind,
				"accountID":     accountID,
				"templateID":    templateID,
				"source":        body.Payload.Source,
				"jobs":          body.Payload.Jobs,
			}, options.Replace().SetUpsert(true))
			return replaceErr
		})
		if err != nil {
			metrics.Error("database_error")
			helper.RespondEndpointServerError(w, r, "payload update failed", "group templates payload update failed", "group_templates_payload_update_failed", "group_templates", err, nil)
			return
		}
	}

	err = runMongoRetry(ctx, fmt.Sprintf("group_templates update catalog entry %s", templateID), func() error {
		_, updateErr := catColl.UpdateOne(ctx,
			bson.M{"_id": accountID},
			bson.M{
				"$set": bson.M{
					"templates.$[t]": updated,
				},
				"$inc": bson.M{"catalogVersion": 1},
			},
			options.Update().SetArrayFilters(options.ArrayFilters{
				Filters: []interface{}{bson.M{"t.templateID": templateID}},
			}),
		)
		return updateErr
	})
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "catalog save failed", "group templates catalog save failed", "group_templates_catalog_save_failed", "group_templates", err, nil)
		return
	}
	logs.AttachDebugStep(r, "template_updated", map[string]interface{}{
		"template_id": templateID,
	})
	metrics.Success()
	w.WriteHeader(http.StatusNoContent)
}

// DeleteTemplateHandler DELETE /api/v1/group-templates/:id
func DeleteTemplateHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients, templateID string) {
	ctx := r.Context()
	metrics := beginGroupTemplateMetrics(ctx)
	defer metrics.Finish()
	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodDelete)
	if !ok {
		return
	}
	payColl := payloadCollection(clients)
	var delRes *mongo.DeleteResult
	err := runMongoRetry(ctx, fmt.Sprintf("group_templates delete payload %s", templateID), func() error {
		var deleteErr error
		delRes, deleteErr = payColl.DeleteOne(ctx, bson.M{"_id": templateID, "accountID": accountID})
		return deleteErr
	})
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "delete payload failed", "group templates delete payload failed", "group_templates_delete_payload_failed", "group_templates", err, nil)
		return
	}
	if delRes.DeletedCount == 0 {
		helper.RespondNotFound(w, r, metrics)
		return
	}
	catColl := catalogCollection(clients)
	err = runMongoRetry(ctx, fmt.Sprintf("group_templates pull catalog entry %s", templateID), func() error {
		_, updateErr := catColl.UpdateOne(ctx, bson.M{"_id": accountID}, bson.M{
			"$pull": bson.M{"templates": bson.M{"templateID": templateID}},
			"$inc":  bson.M{"catalogVersion": 1},
		})
		return updateErr
	})
	if err != nil {
		metrics.Error("database_error")
		logs.AttachHandlerCaveat(r, "catalog_pull_after_delete_failed", "catalog pull after payload delete failed", map[string]interface{}{
			"error":       err.Error(),
			"template_id": templateID,
		})
	}
	metrics.Success()
	logs.AttachDebugStep(r, "template_deleted", map[string]interface{}{
		"template_id": templateID,
	})
	w.WriteHeader(http.StatusNoContent)
	logs.AttachHandlerSuccessDetail(r, "group template deleted", map[string]interface{}{
		"template_id": templateID,
	})
}
