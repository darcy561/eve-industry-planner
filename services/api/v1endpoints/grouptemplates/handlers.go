package grouptemplates

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/mongo/writers"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Handlers struct {
	*apideps.Deps
}

func New(deps *apideps.Deps) *Handlers {
	if deps == nil {
		deps = &apideps.Deps{}
	}
	return &Handlers{Deps: deps}
}

type catalogStored struct {
	ID             string                        `bson:"_id"`
	SchemaVersion  int                           `bson:"schemaVersion"`
	DocumentKind   string                        `bson:"documentKind"`
	AccountID      string                        `bson:"accountID"`
	CatalogVersion int64                         `bson:"catalogVersion"`
	Templates      []models.TemplateCatalogEntry `bson:"templates"`
}

func loadCatalogDoc(ctx context.Context, catalogue *eipmongo.Docs, accountID string) (*catalogStored, error) {
	coll := catalogue.Collection()
	var doc catalogStored
	err := eipmongo.Retry(ctx, fmt.Sprintf("group_templates load catalogue %s", accountID), func() error {
		return coll.FindOne(ctx, bson.M{"_id": accountID}).Decode(&doc)
	})
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

func ensureCatalogDoc(ctx context.Context, catalogue *eipmongo.Docs, accountID string) (*catalogStored, error) {
	doc, err := loadCatalogDoc(ctx, catalogue, accountID)
	if err == nil {
		return doc, nil
	}
	if !errors.Is(err, mongodriver.ErrNoDocuments) {
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
	err = eipmongo.Retry(ctx, fmt.Sprintf("group_templates ensure catalogue %s", accountID), func() error {
		_, insertErr := catalogue.Collection().InsertOne(ctx, initial)
		return insertErr
	})
	if err != nil {
		if mongodriver.IsDuplicateKeyError(err) {
			return loadCatalogDoc(ctx, catalogue, accountID)
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
func (h *Handlers) GetCatalogHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	metrics := beginGroupTemplateMetrics(ctx)
	defer metrics.Finish()
	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodGet)
	if !ok {
		return
	}
	doc, err := loadCatalogDoc(ctx, h.Mongo.TemplateCatalog, accountID)
	if errors.Is(err, mongodriver.ErrNoDocuments) {
		_ = helper.EncodeJSON(w, map[string]any{"templates": []models.TemplateCatalogEntry{}})
		metrics.Success()
		return
	}
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to load templates", "group-templates catalogue load", "group_templates_catalog_load_failed", "group_templates", err, nil)
		return
	}
	logs.AttachDebugStep(r, "mongo_query_completed", map[string]any{
		"template_count": len(doc.Templates),
	})
	_ = helper.EncodeJSON(w, map[string]any{"templates": doc.Templates})
	metrics.Success()
}

// GetCatalogEntryHandler GET /api/v1/group-templates/:id
func (h *Handlers) GetCatalogEntryHandler(w http.ResponseWriter, r *http.Request, templateID string) {
	ctx := r.Context()
	metrics := beginGroupTemplateMetrics(ctx)
	defer metrics.Finish()
	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodGet)
	if !ok {
		return
	}
	doc, err := loadCatalogDoc(ctx, h.Mongo.TemplateCatalog, accountID)
	if err != nil {
		if errors.Is(err, mongodriver.ErrNoDocuments) {
			helper.RespondNotFound(w, r, metrics)
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to load catalogue", "group templates catalogue load by id", "group_templates_catalog_entry_failed", "group_templates", err, nil)
		return
	}
	idx := findTemplateIndex(doc.Templates, templateID)
	if idx >= 0 {
		logs.AttachDebugStep(r, "mongo_query_completed", map[string]any{
			"template_id": templateID,
		})
		_ = helper.EncodeJSON(w, doc.Templates[idx])
		metrics.Success()
		return
	}
	helper.RespondNotFound(w, r, metrics)
}

// GetPayloadFullHandler GET /api/v1/group-templates/:id/full
func (h *Handlers) GetPayloadFullHandler(w http.ResponseWriter, r *http.Request, templateID string) {
	ctx := r.Context()
	metrics := beginGroupTemplateMetrics(ctx)
	defer metrics.Finish()
	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodGet)
	if !ok {
		return
	}
	var payload models.GroupTemplatePayload
	err := eipmongo.Retry(ctx, fmt.Sprintf("group_templates get payload %s", templateID), func() error {
		return h.Mongo.TemplatePayloads.Collection().FindOne(ctx, bson.M{"_id": templateID}).Decode(&payload)
	})
	if err != nil {
		if errors.Is(err, mongodriver.ErrNoDocuments) {
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
	logs.AttachDebugStep(r, "mongo_query_completed", map[string]any{
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
func (h *Handlers) PostTemplateHandler(w http.ResponseWriter, r *http.Request) {
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

	cat, err := ensureCatalogDoc(ctx, h.Mongo.TemplateCatalog, accountID)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "catalogue error", "group templates catalogue error", "group_templates_catalog_error", "group_templates", err, nil)
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

	payloadDoc := bson.M{
		"_id":           tid,
		"schemaVersion": body.Payload.SchemaVersion,
		"documentKind":  body.Payload.DocumentKind,
		"accountID":     accountID,
		"templateID":    tid,
		"source":        body.Payload.Source,
		"jobs":          body.Payload.Jobs,
	}

	err = writers.CreateGroupTemplate(ctx, h.Mongo, accountID, entry, payloadDoc)
	if err != nil {
		if mongodriver.IsDuplicateKeyError(err) {
			metrics.Error("duplicate_template_id")
			const msg = "template id already exists"
			helper.RespondEndpointError(w, r, http.StatusConflict, msg, "group templates duplicate id", "group_templates_duplicate_id", "group_templates", errors.New(msg), nil)
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "failed to save template", "group templates save failed", "group_templates_save_failed", "group_templates", err, nil)
		return
	}

	logs.AttachDebugStep(r, "template_saved", map[string]any{
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
func (h *Handlers) PatchTemplateHandler(w http.ResponseWriter, r *http.Request, templateID string) {
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
	doc, err := loadCatalogDoc(ctx, h.Mongo.TemplateCatalog, accountID)
	if err != nil {
		if errors.Is(err, mongodriver.ErrNoDocuments) {
			helper.RespondNotFound(w, r, metrics)
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "catalogue error", "group templates patch catalogue error", "group_templates_patch_catalog_error", "group_templates", err, nil)
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

		payloadDoc := bson.M{
			"_id":           templateID,
			"schemaVersion": body.Payload.SchemaVersion,
			"documentKind":  body.Payload.DocumentKind,
			"accountID":     accountID,
			"templateID":    templateID,
			"source":        body.Payload.Source,
			"jobs":          body.Payload.Jobs,
		}

		if err := writers.ReplaceGroupTemplatePayload(ctx, h.Mongo, accountID, templateID, updated, payloadDoc); err != nil {
			metrics.Error("database_error")
			helper.RespondEndpointServerError(w, r, "template update failed", "group templates patch failed", "group_templates_patch_failed", "group_templates", err, nil)
			return
		}
	} else {
		err = eipmongo.Retry(ctx, fmt.Sprintf("group_templates update catalogue entry %s", templateID), func() error {
			_, updateErr := h.Mongo.TemplateCatalog.Collection().UpdateOne(ctx,
				bson.M{"_id": accountID},
				bson.M{
					"$set": bson.M{"templates.$[t]": updated},
					"$inc": bson.M{"catalogVersion": 1},
				},
				options.UpdateOne().SetArrayFilters([]any{bson.M{"t.templateID": templateID}}),
			)
			return updateErr
		})
		if err != nil {
			metrics.Error("database_error")
			helper.RespondEndpointServerError(w, r, "catalogue save failed", "group templates catalogue save failed", "group_templates_catalog_save_failed", "group_templates", err, nil)
			return
		}
	}

	logs.AttachDebugStep(r, "template_updated", map[string]any{
		"template_id": templateID,
	})
	metrics.Success()
	w.WriteHeader(http.StatusNoContent)
}

// DeleteTemplateHandler DELETE /api/v1/group-templates/:id
func (h *Handlers) DeleteTemplateHandler(w http.ResponseWriter, r *http.Request, templateID string) {
	ctx := r.Context()
	metrics := beginGroupTemplateMetrics(ctx)
	defer metrics.Finish()
	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodDelete)
	if !ok {
		return
	}
	result, err := writers.DeleteGroupTemplate(ctx, h.Mongo, accountID, templateID)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "delete template failed", "group templates delete failed", "group_templates_delete_failed", "group_templates", err, nil)
		return
	}
	if result == nil || result.DeletedCount == 0 {
		helper.RespondNotFound(w, r, metrics)
		return
	}

	metrics.Success()
	logs.AttachDebugStep(r, "template_deleted", map[string]any{
		"template_id": templateID,
	})
	w.WriteHeader(http.StatusNoContent)
	logs.AttachHandlerSuccessDetail(r, "group template deleted", map[string]any{
		"template_id": templateID,
	})
}
