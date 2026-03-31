package firebaseuserdoc

import (
	"encoding/json"
	"time"

	"eve-industry-planner/shared/shared/models"
)

// ParseUserDoc unmarshals a Firebase user document (e.g. from Firestore or request body) into UserDoc.
func ParseUserDoc(doc map[string]interface{}) (*UserDoc, error) {
	if len(doc) == 0 {
		return nil, nil
	}
	docJSON, err := json.Marshal(doc)
	if err != nil {
		return nil, err
	}
	var fb UserDoc
	if err := json.Unmarshal(docJSON, &fb); err != nil {
		return nil, err
	}
	return &fb, nil
}

// MapUserAccountForImport converts a Firebase UserDoc to the MongoDB user account
// document format for import flows where lifecycle timestamps are explicitly known.
func MapUserAccountForImport(fb *UserDoc, accountID string, createdAt, lastLoginAt time.Time) models.UserAccountDocument {
	accountDoc := buildUserAccountDocumentBase(fb, accountID)
	accountDoc.MetaData.CreatedAt = createdAt
	accountDoc.MetaData.LastLoginAt = lastLoginAt
	return accountDoc
}

// MapUserAccountForSync converts a Firebase UserDoc to the MongoDB user account format
// for sync/update paths. _meta is intentionally excluded during sync writes so existing
// lifecycle timestamps in metadata are preserved.
func MapUserAccountForSync(fb *UserDoc, accountID string) models.UserAccountDocument {
	return buildUserAccountDocumentBase(fb, accountID)
}

func buildUserAccountDocumentBase(fb *UserDoc, accountID string) models.UserAccountDocument {
	jobStatus := mapJobStatusArray(fb)
	tokens := mapRefreshTokens(fb)
	linkedJobs := withDefaultInt64Slice(fb.LinkedJobs)
	linkedTrans := withDefaultInt64Slice(fb.LinkedTrans)
	linkedOrders := withDefaultInt64Slice(fb.LinkedOrders)
	flagForDeletion := false
	var deletedAt *time.Time
	if fb.Deleted != nil {
		flagForDeletion = true
	}
	return models.UserAccountDocument{
		AccountID:       accountID,
		JobStatusArray:  jobStatus,
		LinkedJobs:      linkedJobs,
		LinkedTrans:     linkedTrans,
		LinkedOrders:    linkedOrders,
		RefreshTokens:   tokens,
		FlagForDeletion: flagForDeletion,
		DeletedAt:       deletedAt,
		MetaData: models.UserMeta{
			MetaData: models.MetaData{
				AccountID: accountID,
			},
		},
	}
}

func mapJobStatusArray(fb *UserDoc) []models.JobStatus {
	jobStatus := make([]models.JobStatus, 0, len(fb.JobStatusArray))
	for _, j := range fb.JobStatusArray {
		jobStatus = append(jobStatus, models.JobStatus{
			ID:              j.ID,
			Name:            j.Name,
			SortOrder:       j.SortOrder,
			Expanded:        j.Expanded,
			OpenAPIJobs:     j.OpenAPIJobs,
			CompleteAPIJobs: j.CompleteAPIJobs,
		})
	}
	return jobStatus
}

func mapRefreshTokens(fb *UserDoc) []models.RefreshToken {
	tokens := make([]models.RefreshToken, 0, len(fb.RefreshTokens))
	for _, t := range fb.RefreshTokens {
		tokens = append(tokens, models.RefreshToken{
			CharacterHash: t.CharacterHash,
			RToken:        t.RToken,
		})
	}
	return tokens
}

func withDefaultInt64Slice(values []int64) []int64 {
	if values == nil {
		return []int64{}
	}
	return values
}

// MapApplicationSettings converts a Firebase UserDoc to the MongoDB application settings
// document format for both import and sync/update flows.
func MapApplicationSettings(fb *UserDoc, accountID string) models.ApplicationSettings {
	return buildApplicationSettingsBase(fb, accountID)
}

func buildApplicationSettingsBase(fb *UserDoc, accountID string) models.ApplicationSettings {
	s := models.ApplicationSettings{
		MetaData: models.MetaData{
			AccountID: accountID,
		},
		ExemptTypeIDs:           []int{},
		PredefinedSystemIndexes: make(map[string]map[string]float64),
		CustomStructures: models.CustomStructures{
			Manufacturing: []models.CustomStructure{},
			Reaction:      []models.CustomStructure{},
			Reprocessing:  []models.ReprocessingStructure{},
		},
		ReprocessingSettings: models.ReprocessingSettings{
			PreferCompressed:           true,
			CompressionBonusMultiplier: 0.25,
			ValueMultiplier:            2.0,
			WastePenaltyMultiplier:     0.1,
			SellExcessMineralTypes:     false,
		},
		ExtrasCategories: []models.ExtraCategory{
			{ID: "0", Label: "Unassigned"},
			{ID: "1", Label: "Hauling Service"},
			{ID: "2", Label: "Jump Freight Service"},
			{ID: "3", Label: "Blueprint Copies"},
			{ID: "4", Label: "Loyal Point Costs"},
			{ID: "5", Label: "Other"},
		},
	}
	if fb.Settings != nil {
		if a := fb.Settings.Account; a != nil {
			s.UseCloudAccounts = a.CloudAccounts
		}
		if l := fb.Settings.Layout; l != nil {
			s.LocalMarketDisplay = l.LocalMarketDisplay
			s.LocalOrderDisplay = l.LocalOrderDisplay
			s.EsiJobTab = l.EsiJobTab
			s.EnableCompactLayoutView = l.EnableCompactView
		}
		if e := fb.Settings.EditJob; e != nil {
			s.DefaultMarketLocation = e.DefaultMarket
			s.DefaultOrderType = e.DefaultOrders
			s.HideCompleteMaterialsFromEditJob = e.HideCompleteMaterials
			s.DefaultStationIDForAssets = e.DefaultAssetLocation
			s.DefaultCitadelBrokersFee = e.CitadelBrokersFee
			s.DefaultMaterialEfficiencyValue = e.DefaultMaterialEfficiencyValue
		}
		if st := fb.Settings.Structures; st != nil {
			s.CustomStructures = models.CustomStructures{
				Manufacturing: st.Manufacturing,
				Reaction:      st.Reaction,
				Reprocessing:  st.Reprocessing,
			}
		}
		if fb.Settings.ExemptTypeIDs != nil {
			s.ExemptTypeIDs = fb.Settings.ExemptTypeIDs
		}
		if fb.Settings.AutomaticJobRecalculation != nil {
			s.EnableAutomaticJobRecalculation = *fb.Settings.AutomaticJobRecalculation
		} else {
			s.EnableAutomaticJobRecalculation = true
		}
		if fb.Settings.IgnoreItemsWithoutBlueprints != nil {
			s.EnableSkipMissingBlueprints = *fb.Settings.IgnoreItemsWithoutBlueprints
		}
		if fb.Settings.DefaultReprocessingCharacter != nil {
			s.ReprocessingSettings.DefaultReprocessingCharacter = fb.Settings.DefaultReprocessingCharacter
		}
		if r := fb.Settings.ReprocessingCalculationSettings; r != nil {
			s.ReprocessingSettings.PreferCompressed = r.PreferCompressed
			s.ReprocessingSettings.CompressionBonusMultiplier = r.CompressionBonusMultiplier
			s.ReprocessingSettings.ValueMultiplier = r.ValueMultiplier
			s.ReprocessingSettings.WastePenaltyMultiplier = r.WastePenaltyMultiplier
			s.ReprocessingSettings.SellExcessMineralTypes = r.SellExcessMineralTypes
		}
		if fb.Settings.ExtrasCategories != nil {
			extras := make([]models.ExtraCategory, 0, len(fb.Settings.ExtrasCategories))
			for _, c := range fb.Settings.ExtrasCategories {
				extras = append(extras, models.ExtraCategory{
					ID:        c.ID,
					Label:     c.Label,
					Deleted:   c.Deleted,
					DeletedAt: c.DeletedAt,
				})
			}
			s.ExtrasCategories = extras
		}
		if fb.Settings.PredefinedSystemIndexes != nil {
			s.PredefinedSystemIndexes = fb.Settings.PredefinedSystemIndexes
		}
	}
	return s
}
