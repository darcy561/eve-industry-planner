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

// Settings is the settings a planner's work is done under, as opposed to the
// settings that decide how one account sees its own screen.
//
// A setting belongs here when a job or a setup stores a reference to it, or when
// it decides how work is done in the planner. `CustomStructureID` on every setup
// is the case that forced the split: it is a key into a settings document, so a
// member opening another's job resolves it against their own and finds nothing.
//
// Its _id is the owner key, as the planner document's is, so the owner is stored
// once rather than beside a copy of itself.
type Settings struct {
	ID            string `bson:"_id" json:"-"`
	SchemaVersion int    `bson:"schemaVersion,omitempty" json:"schemaVersion,omitempty"`

	CustomStructures               models.CustomStructures       `bson:"customStructures" json:"customStructures"`
	DefaultMaterialEfficiencyValue int                           `bson:"defaultMaterialEfficiencyValue" json:"defaultMaterialEfficiencyValue"`
	PredefinedSystemIndexes        map[string]map[string]float64 `bson:"predefinedSystemIndexes" json:"predefinedSystemIndexes,omitempty"`
	ExtrasCategories               []models.ExtraCategory        `bson:"extrasCategories" json:"extrasCategories,omitempty"`
	DefaultCitadelBrokersFee       float64                       `bson:"defaultCitadelBrokersFee" json:"defaultCitadelBrokersFee"`
	ReprocessingSettings           models.ReprocessingSettings   `bson:"reprocessingSettings" json:"reprocessingSettings"`
	ExemptTypeIDs                  []int                         `bson:"exemptTypeIDs" json:"exemptTypeIDs,omitempty"`

	MetaData models.MetaData `bson:"_meta" json:"_meta"`
}

// Owner reads the settings' owner back out of its id.
func (s Settings) Owner() (models.Owner, error) { return models.ParseOwnerKey(s.ID) }

// DefaultSettings returns the settings a planner starts with when nothing seeds
// it from an account.
func DefaultSettings(owner models.Owner, now time.Time) Settings {
	return Settings{
		ID:                             owner.Key(),
		SchemaVersion:                  SettingsSchemaCurrent,
		CustomStructures:               models.EmptyCustomStructures(),
		DefaultMaterialEfficiencyValue: 0,
		PredefinedSystemIndexes:        make(map[string]map[string]float64),
		ExtrasCategories:               models.DefaultExtrasCategories(),
		DefaultCitadelBrokersFee:       1,
		ReprocessingSettings:           models.DefaultReprocessingSettings(),
		ExemptTypeIDs:                  []int{},
		MetaData: models.MetaData{
			LastModified: now,
			Owner:        owner,
		},
	}
}

// SettingsFromAccount seeds a planner's settings from an account's, so a planner
// behaves as the account that created it expects.
//
// The account-side fields are not read: they stay on the account document and
// keep deciding how that person sees their own screen, wherever they are working.
func SettingsFromAccount(owner models.Owner, settings models.ApplicationSettings, now time.Time) Settings {
	seeded := DefaultSettings(owner, now)
	seeded.DefaultMaterialEfficiencyValue = settings.DefaultMaterialEfficiencyValue
	seeded.DefaultCitadelBrokersFee = settings.DefaultCitadelBrokersFee
	seeded.ReprocessingSettings = settings.ReprocessingSettings
	// Copied rather than assigned: the account's own settings are live in the
	// caller, and a shared slice or map would make an edit to one show up in the
	// other.
	seeded.CustomStructures = models.CustomStructures{
		Manufacturing: slices.Clone(settings.CustomStructures.Manufacturing),
		Reaction:      slices.Clone(settings.CustomStructures.Reaction),
		Reprocessing:  slices.Clone(settings.CustomStructures.Reprocessing),
		Invention:     slices.Clone(settings.CustomStructures.Invention),
	}
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
const fieldExtrasCategories = "extrasCategories"

// A list long enough to be a mistake rather than a preference, and a label
// longer than anything a picker can show.
const (
	maxExtrasCategories    = 200
	maxExtrasCategoryLabel = 120
)

// SettingsUpdate is the part of a planner's settings a member may change. A nil
// field is left as it is stored, so a client sends only what it edited.
type SettingsUpdate struct {
	ExtrasCategories *[]models.ExtraCategory `json:"extrasCategories"`
}

// Validate refuses an update that would leave the planner's settings unusable.
func (u SettingsUpdate) Validate() error {
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

// Fields is what the update sets, as stored. An empty result means the update
// carried nothing.
func (u SettingsUpdate) Fields() bson.M {
	fields := bson.M{}
	if u.ExtrasCategories != nil {
		fields[fieldExtrasCategories] = *u.ExtrasCategories
	}
	return fields
}
