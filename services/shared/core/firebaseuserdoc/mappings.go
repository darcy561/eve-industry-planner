package firebaseuserdoc

import (
	"encoding/json"
	"strconv"
	"strings"
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
// for Firestore→Mongo sync. Lifecycle fields not present in Firestore are zero; callers
// that replace the whole document may merge existing Mongo _meta before writing.
func MapUserAccountForSync(fb *UserDoc, accountID string) models.UserAccountDocument {
	return buildUserAccountDocumentBase(fb, accountID)
}

func buildUserAccountDocumentBase(fb *UserDoc, accountID string) models.UserAccountDocument {
	tokens := mapRefreshTokens(fb)
	linkedJobs := withDefaultInt64Slice(fb.LinkedJobs)
	linkedTrans := withDefaultInt64Slice(fb.LinkedTrans)
	linkedOrders := withDefaultInt64Slice(fb.LinkedOrders)
	return models.UserAccountDocument{
		LinkedJobs:        linkedJobs,
		LinkedTrans:       linkedTrans,
		LinkedOrders:      linkedOrders,
		UserCloudAccounts: fbCloudAccountsEnabled(fb),
		RefreshTokens:     tokens,
		MetaData: models.UserMeta{
			MetaData: models.MetaData{
				AccountID: accountID,
			},
			// Legacy Firestore `deleted` is an untyped sentinel; lifecycle `deletedAt` is set only via explicit Mongo flows.
			DeletedAt: nil,
		},
	}
}

func fbCloudAccountsEnabled(fb *UserDoc) bool {
	if fb == nil || fb.Settings == nil || fb.Settings.Account == nil {
		return false
	}
	return fb.Settings.Account.CloudAccounts
}

func jobStatusesForApplicationSettings(fb *UserDoc) map[string]models.JobStatusEntry {
	if fb.Settings != nil && len(fb.Settings.JobStatuses) > 0 {
		out := make(map[string]models.JobStatusEntry, len(fb.Settings.JobStatuses))
		for k, v := range fb.Settings.JobStatuses {
			out[k] = models.JobStatusEntry{Name: v.Name}
		}
		return out
	}
	out := make(map[string]models.JobStatusEntry, len(fb.JobStatusArray))
	for _, j := range fb.JobStatusArray {
		out[strconv.Itoa(j.ID)] = models.JobStatusEntry{Name: j.Name}
	}
	return out
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

// extrasCategoryFromFirebase maps one Firestore row to models.ExtraCategory (DeletedAt as RFC3339 / ISO-8601 string or nil).
func extrasCategoryFromFirebase(c ExtraCategory) models.ExtraCategory {
	return models.NormalizeExtraCategory(models.ExtraCategory{
		ID:        c.ID,
		Label:     c.Label,
		Deleted:   c.Deleted,
		DeletedAt: models.ParseExtrasDeletedAtJSON(c.DeletedAt),
	})
}

// MapApplicationSettings converts a Firebase UserDoc to the MongoDB application settings
// document format for both import and sync/update flows.
func MapApplicationSettings(fb *UserDoc, accountID string) models.ApplicationSettings {
	return buildApplicationSettingsBase(fb, accountID)
}

func buildApplicationSettingsBase(fb *UserDoc, accountID string) models.ApplicationSettings {
	now := time.Now().UTC()
	s := models.DefaultApplicationSettings(accountID, now)
	if fb.Settings != nil {
		if l := fb.Settings.Layout; l != nil {
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
		// Legacy Firebase layout.localMarketDisplay/localOrderDisplay duplicated edit-job defaults;
		// fold into defaultMarketLocation/defaultOrderType when editJob did not supply values.
		if fb.Settings.Layout != nil {
			l := fb.Settings.Layout
			if l.LocalMarketDisplay != nil && strings.TrimSpace(*l.LocalMarketDisplay) != "" {
				if fb.Settings.EditJob == nil || strings.TrimSpace(fb.Settings.EditJob.DefaultMarket) == "" {
					s.DefaultMarketLocation = strings.TrimSpace(*l.LocalMarketDisplay)
				}
			}
			if l.LocalOrderDisplay != nil && strings.TrimSpace(*l.LocalOrderDisplay) != "" {
				if fb.Settings.EditJob == nil || strings.TrimSpace(fb.Settings.EditJob.DefaultOrders) == "" {
					s.DefaultOrderType = strings.TrimSpace(*l.LocalOrderDisplay)
				}
			}
		}
		if st := fb.Settings.Structures; st != nil {
			s.CustomStructures = models.CustomStructures{
				Manufacturing: mapFirestoreCustomStructures(st.Manufacturing),
				Reaction:      mapFirestoreCustomStructures(st.Reaction),
				Reprocessing:  mapFirestoreReprocessingStructures(st.Reprocessing),
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
				extras = append(extras, extrasCategoryFromFirebase(c))
			}
			s.ExtrasCategories = extras
		}
		if fb.Settings.PredefinedSystemIndexes != nil {
			s.PredefinedSystemIndexes = fb.Settings.PredefinedSystemIndexes
		}
	}
	for k, v := range jobStatusesForApplicationSettings(fb) {
		s.JobStatuses[k] = v
	}
	s.ExtrasCategories = models.NormalizeExtrasCategories(s.ExtrasCategories)
	return s
}
