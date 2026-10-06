package planner

import (
	"errors"
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Settings is the settings a planner's work is done under, as opposed to how one account sees its
// own screen; its _id is the owner key.
type Settings struct {
	ID            string `bson:"_id" json:"-"`
	SchemaVersion int    `bson:"schemaVersion,omitempty" json:"schemaVersion,omitempty"`

	CustomStructures               models.CustomStructures       `bson:"customStructures" json:"customStructures"`
	MarketLocations                models.MarketLocations        `bson:"marketLocations" json:"marketLocations"`
	DefaultMaterialEfficiencyValue int                           `bson:"defaultMaterialEfficiencyValue" json:"defaultMaterialEfficiencyValue"`
	PredefinedSystemIndexes        map[string]map[string]float64 `bson:"predefinedSystemIndexes" json:"predefinedSystemIndexes,omitempty"`
	ExtrasCategories               []models.ExtraCategory        `bson:"extrasCategories" json:"extrasCategories,omitempty"`
	DefaultCitadelBrokersFee       float64                       `bson:"defaultCitadelBrokersFee" json:"defaultCitadelBrokersFee"`
	ReprocessingSettings           ReprocessingSettings          `bson:"reprocessingSettings" json:"reprocessingSettings"`
	ExemptTypeIDs                  []int                         `bson:"exemptTypeIDs" json:"exemptTypeIDs,omitempty"`

	MetaData models.MetaData `bson:"_meta" json:"_meta"`
}

// Owner reads the settings' owner back out of its id.
func (s Settings) Owner() (models.Owner, error) { return models.ParseOwnerKey(s.ID) }

// DefaultSettings returns the settings a planner starts with when nothing seeds it from an account.
func DefaultSettings(owner models.Owner, now time.Time) Settings {
	return Settings{
		ID:                             owner.Key(),
		SchemaVersion:                  SettingsSchemaCurrent,
		CustomStructures:               models.EmptyCustomStructures(),
		MarketLocations:                models.EmptyMarketLocations(),
		DefaultMaterialEfficiencyValue: 0,
		PredefinedSystemIndexes:        make(map[string]map[string]float64),
		ExtrasCategories:               models.DefaultExtrasCategories(),
		DefaultCitadelBrokersFee:       1,
		ReprocessingSettings:           DefaultReprocessingSettings(),
		ExemptTypeIDs:                  []int{},
		MetaData: models.MetaData{
			LastModified: now,
			Owner:        owner,
		},
	}
}

// SettingsFromAccount seeds a planner's settings from the planner-side fields of an account's, each
// copied so an edit to one does not show in the other.
func SettingsFromAccount(owner models.Owner, settings models.ApplicationSettings, now time.Time) Settings {
	seeded := DefaultSettings(owner, now)
	seeded.DefaultMaterialEfficiencyValue = settings.DefaultMaterialEfficiencyValue
	seeded.DefaultCitadelBrokersFee = settings.DefaultCitadelBrokersFee
	seeded.CustomStructures = slices.Clone(settings.CustomStructures)
	if settings.PredefinedSystemIndexes != nil {
		indexes := make(map[string]map[string]float64, len(settings.PredefinedSystemIndexes))
		for system, byJobType := range settings.PredefinedSystemIndexes {
			indexes[system] = maps.Clone(byJobType)
		}
		seeded.PredefinedSystemIndexes = indexes
	}
	if settings.ExtrasCategories != nil {
		seeded.ExtrasCategories = slices.Clone(settings.ExtrasCategories)
	}
	if settings.ExemptTypeIDs != nil {
		seeded.ExemptTypeIDs = slices.Clone(settings.ExemptTypeIDs)
	}
	return seeded
}

// Settings field names, as SettingsUpdate writes them.
const (
	fieldExtrasCategories     = "extrasCategories"
	fieldMarketLocations      = "marketLocations"
	fieldReprocessingSettings = "reprocessingSettings"
)

// The most extras categories a list may hold, and the longest label a picker can show.
const (
	maxExtrasCategories    = 200
	maxExtrasCategoryLabel = 120
)

// SettingsUpdate is the part of a planner's settings a member may change; a nil field is left as
// it is stored, so a client sends only what it edited.
type SettingsUpdate struct {
	ExtrasCategories     *[]models.ExtraCategory `json:"extrasCategories"`
	MarketLocations      *models.MarketLocations `json:"marketLocations"`
	ReprocessingSettings *ReprocessingSettings   `json:"reprocessingSettings"`
}

// Validate refuses an update that would leave the planner's settings unusable.
func (u SettingsUpdate) Validate() error {
	if u.MarketLocations != nil {
		if err := u.MarketLocations.Validate(); err != nil {
			return err
		}
	}
	if u.ReprocessingSettings != nil {
		if err := u.ReprocessingSettings.Validate(); err != nil {
			return err
		}
	}
	return u.validateExtrasCategories()
}

// validateExtrasCategories holds the list to what a picker can show and what the costs filed under
// it need to still resolve.
func (u SettingsUpdate) validateExtrasCategories() error {
	if u.ExtrasCategories == nil {
		return nil
	}
	categories := *u.ExtrasCategories
	if len(categories) > maxExtrasCategories {
		return fmt.Errorf("extras categories: %d is more than the %d allowed", len(categories), maxExtrasCategories)
	}

	seen := make(map[string]models.ExtraCategory, len(categories))
	for _, category := range categories {
		id := strings.TrimSpace(category.ID)
		if id == "" {
			return errors.New("extras categories: a category has no id")
		}
		if _, duplicate := seen[id]; duplicate {
			return fmt.Errorf("extras categories: id %q appears twice", id)
		}
		if strings.TrimSpace(category.Label) == "" {
			return fmt.Errorf("extras categories: category %q has no label", id)
		}
		if len(category.Label) > maxExtrasCategoryLabel {
			return fmt.Errorf("extras categories: label for %q is longer than %d characters", id, maxExtrasCategoryLabel)
		}
		seen[id] = category
	}

	for _, id := range models.PermanentExtrasCategoryIDs() {
		category, present := seen[id]
		if !present || category.Deleted {
			return fmt.Errorf("extras categories: %q must be present and not deleted", id)
		}
	}
	return nil
}

// Fields is what the update sets, as stored; an empty result means the update carried nothing.
func (u SettingsUpdate) Fields() bson.M {
	fields := bson.M{}
	if u.ExtrasCategories != nil {
		fields[fieldExtrasCategories] = *u.ExtrasCategories
	}
	if u.MarketLocations != nil {
		fields[fieldMarketLocations] = *u.MarketLocations
	}
	if u.ReprocessingSettings != nil {
		fields[fieldReprocessingSettings] = *u.ReprocessingSettings
	}
	return fields
}
