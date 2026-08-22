package models

import (
	"fmt"
	"time"
)

// Group template v1 — catalog + payload documents (see product plan).

const (
	GroupTemplateCatalogSchemaVersion = 1
	GroupTemplatePayloadSchemaVersion = 1
	GroupTemplateCatalogDocumentKind  = "groupTemplateCatalog"
	GroupTemplatePayloadDocumentKind  = "groupTemplatePayload"
	MaxTemplatesPerAccount            = 50
	MaxJobsPerTemplate                = 300
	MaxSetupsPerJob                   = 32
)

// TemplateOutputSummary is one root deliverable row in the catalog.
type TemplateOutputSummary struct {
	TemplateJobID        string `json:"templateJobId" bson:"templateJobId"`
	ItemID               int    `json:"itemID" bson:"itemID"`
	DesiredTotalQuantity int    `json:"desiredTotalQuantity" bson:"desiredTotalQuantity"`
}

// TemplateCatalogEntry is one row in catalog.templates[].
type TemplateCatalogEntry struct {
	TemplateID        string                  `json:"templateID" bson:"templateID"`
	Name              string                  `json:"name" bson:"name"`
	Description       string                  `json:"description" bson:"description"`
	TotalJobs         int                     `json:"totalJobs" bson:"totalJobs"`
	OutputsSummary    []TemplateOutputSummary `json:"outputsSummary" bson:"outputsSummary"`
	RootOutputItemIDs []int                   `json:"rootOutputItemIDs" bson:"rootOutputItemIDs"`
	PayloadDocumentID string                  `json:"payloadDocumentId" bson:"payloadDocumentId"`
	CreatedAt         time.Time               `json:"createdAt" bson:"createdAt"`
	UpdatedAt         time.Time               `json:"updatedAt" bson:"updatedAt"`
}

// GroupTemplateCatalog is one Mongo document per account (_id = accountID).
type GroupTemplateCatalog struct {
	SchemaVersion  int                    `json:"schemaVersion" bson:"schemaVersion"`
	DocumentKind   string                 `json:"documentKind" bson:"documentKind"`
	AccountID      string                 `json:"accountID" bson:"accountID"`
	CatalogVersion int64                  `json:"catalogVersion" bson:"catalogVersion"`
	Templates      []TemplateCatalogEntry `json:"templates" bson:"templates"`
}

// TemplatePresetSetup is one setup row stored on a template job node.
type TemplatePresetSetup struct {
	RunCount          int     `json:"runCount" bson:"runCount"`
	JobCount          int     `json:"jobCount" bson:"jobCount"`
	ME                int     `json:"ME" bson:"ME"`
	TE                int     `json:"TE" bson:"TE"`
	RigID             int     `json:"rigID" bson:"rigID"`
	StructureID       int     `json:"structureID" bson:"structureID"`
	SystemTypeID      int     `json:"systemTypeID" bson:"systemTypeID"`
	SystemID          int64   `json:"systemID" bson:"systemID"`
	TaxValue          float64 `json:"taxValue" bson:"taxValue"`
	CustomStructureID string  `json:"customStructureID" bson:"customStructureID"`
	CharacterToUse    string  `json:"characterToUse,omitempty" bson:"characterToUse,omitempty"`
}

// TemplateJobNode is one node in payload.jobs[].
type TemplateJobNode struct {
	TemplateJobID              string                `json:"templateJobId" bson:"templateJobId"`
	ItemID                     int                   `json:"itemID" bson:"itemID"`
	JobType                    int                   `json:"jobType" bson:"jobType"`
	Name                       string                `json:"name,omitempty" bson:"name,omitempty"`
	DesiredTotalQuantity       int                   `json:"desiredTotalQuantity" bson:"desiredTotalQuantity"`
	ParentTemplateJobIDs       []string              `json:"parentTemplateJobIds" bson:"parentTemplateJobIds"`
	ChildLinksByMaterialTypeID map[string][]string   `json:"childLinksByMaterialTypeId" bson:"childLinksByMaterialTypeId"`
	PresetSetups               []TemplatePresetSetup `json:"presetSetups" bson:"presetSetups"`
}

// GroupTemplatePayloadSource optional provenance.
type GroupTemplatePayloadSource struct {
	GroupID    string    `json:"groupID,omitempty" bson:"groupID,omitempty"`
	CapturedAt time.Time `json:"capturedAt" bson:"capturedAt,omitempty"`
}

// GroupTemplatePayload is one Mongo document per templateID (_id = templateID string).
type GroupTemplatePayload struct {
	SchemaVersion int                         `json:"schemaVersion" bson:"schemaVersion"`
	DocumentKind  string                      `json:"documentKind" bson:"documentKind"`
	AccountID     string                      `json:"accountID" bson:"accountID"`
	TemplateID    string                      `json:"templateID" bson:"templateID"`
	Source        *GroupTemplatePayloadSource `json:"source,omitempty" bson:"source,omitempty"`
	Jobs          []TemplateJobNode           `json:"jobs" bson:"jobs"`
}

// ValidateGroupTemplatePayload checks graph and size invariants (no recipe math server-side).
func ValidateGroupTemplatePayload(p *GroupTemplatePayload) error {
	if p == nil {
		return fmt.Errorf("payload is nil")
	}
	if p.AccountID == "" || p.TemplateID == "" {
		return fmt.Errorf("accountID and templateID are required")
	}
	if len(p.Jobs) == 0 {
		return fmt.Errorf("jobs must be non-empty")
	}
	if len(p.Jobs) > MaxJobsPerTemplate {
		return fmt.Errorf("too many jobs (max %d)", MaxJobsPerTemplate)
	}
	ids := make(map[string]struct{}, len(p.Jobs))
	for i := range p.Jobs {
		j := &p.Jobs[i]
		if j.TemplateJobID == "" {
			return fmt.Errorf("job[%d]: templateJobId required", i)
		}
		if _, dup := ids[j.TemplateJobID]; dup {
			return fmt.Errorf("duplicate templateJobId %s", j.TemplateJobID)
		}
		ids[j.TemplateJobID] = struct{}{}
		if j.ItemID <= 0 {
			return fmt.Errorf("job %s: itemID invalid", j.TemplateJobID)
		}
		if j.DesiredTotalQuantity <= 0 {
			return fmt.Errorf("job %s: desiredTotalQuantity must be positive", j.TemplateJobID)
		}
		if len(j.PresetSetups) == 0 {
			return fmt.Errorf("job %s: presetSetups required", j.TemplateJobID)
		}
		if len(j.PresetSetups) > MaxSetupsPerJob {
			return fmt.Errorf("job %s: too many setups", j.TemplateJobID)
		}
		for si, s := range j.PresetSetups {
			if s.RunCount <= 0 || s.JobCount <= 0 {
				return fmt.Errorf("job %s setup[%d]: runCount and jobCount must be positive", j.TemplateJobID, si)
			}
		}
	}
	// Reference integrity
	for i := range p.Jobs {
		j := &p.Jobs[i]
		for _, pid := range j.ParentTemplateJobIDs {
			if pid == "" {
				continue
			}
			if _, ok := ids[pid]; !ok {
				return fmt.Errorf("job %s: unknown parent %s", j.TemplateJobID, pid)
			}
		}
		for _, childIDs := range j.ChildLinksByMaterialTypeID {
			for _, cid := range childIDs {
				if _, ok := ids[cid]; !ok {
					return fmt.Errorf("job %s: unknown child %s", j.TemplateJobID, cid)
				}
			}
		}
	}
	return nil
}

// BuildCatalogEntryFromPayload derives the catalog row from a validated payload + metadata.
func BuildCatalogEntryFromPayload(templateID, name, description string, payload *GroupTemplatePayload, createdAt, updatedAt time.Time) TemplateCatalogEntry {
	total := len(payload.Jobs)
	outputs := make([]TemplateOutputSummary, 0)
	rootIDs := make([]int, 0)
	seen := make(map[int]struct{})
	for i := range payload.Jobs {
		j := &payload.Jobs[i]
		if len(j.ParentTemplateJobIDs) == 0 {
			outputs = append(outputs, TemplateOutputSummary{
				TemplateJobID:        j.TemplateJobID,
				ItemID:               j.ItemID,
				DesiredTotalQuantity: j.DesiredTotalQuantity,
			})
			if _, ok := seen[j.ItemID]; !ok {
				seen[j.ItemID] = struct{}{}
				rootIDs = append(rootIDs, j.ItemID)
			}
		}
	}
	return TemplateCatalogEntry{
		TemplateID:        templateID,
		Name:              name,
		Description:       description,
		TotalJobs:         total,
		OutputsSummary:    outputs,
		RootOutputItemIDs: rootIDs,
		PayloadDocumentID: templateID,
		CreatedAt:         createdAt,
		UpdatedAt:         updatedAt,
	}
}
