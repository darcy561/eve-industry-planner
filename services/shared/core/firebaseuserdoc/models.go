package firebaseuserdoc

import "eve-industry-planner/shared/shared/models"

// UserDoc represents the legacy Firebase user document shape (camelCase) for JSON unmarshaling.
// Used when reading from Firestore or when receiving the document from the migration endpoint.
type UserDoc struct {
	AccountID      string        `json:"accountID"`
	JobStatusArray []Job         `json:"jobStatusArray"`
	Deleted        interface{}   `json:"deleted"`
	LinkedJobs     []int64       `json:"linkedJobs"`
	LinkedTrans    []int64       `json:"linkedTrans"`
	LinkedOrders   []int64       `json:"linkedOrders"`
	RefreshTokens  []Token       `json:"refreshTokens"`
	Settings       *Settings     `json:"settings"`
}

// Job represents a job status entry in the Firebase document.
type Job struct {
	ID              int    `json:"id"`
	Name            string `json:"name"`
	SortOrder       int    `json:"sortOrder"`
	Expanded        bool   `json:"expanded"`
	OpenAPIJobs     bool   `json:"openAPIJobs"`
	CompleteAPIJobs bool   `json:"completeAPIJobs"`
}

// Token represents a refresh token in the Firebase document.
type Token struct {
	CharacterHash string `json:"CharacterHash"`
	RToken        string `json:"rToken"`
}

// Settings represents the settings subtree of the Firebase user document.
type Settings struct {
	Account                         *Account              `json:"account"`
	Layout                          *Layout               `json:"layout"`
	EditJob                         *EditJob              `json:"editJob"`
	Structures                      *Structures           `json:"structures"`
	ExemptTypeIDs                   []int                 `json:"exemptTypeIDs"`
	AutomaticJobRecalculation       *bool                 `json:"automaticJobRecalculation"`
	IgnoreItemsWithoutBlueprints    *bool                 `json:"ignoreItemsWithoutBlueprints"`
	DefaultReprocessingCharacter    *string               `json:"defaultReprocessingCharacter"`
	ReprocessingCalculationSettings *ReprocessingSettings `json:"reprocessingCalculationSettings"`
	ExtrasCategories                []ExtraCategory       `json:"extrasCategories"`
	PredefinedSystemIndexes         map[string]map[string]float64 `json:"predefinedSystemIndexes"`
}

// Account represents account-level settings in Firebase.
type Account struct {
	CloudAccounts bool `json:"cloudAccounts"`
}

// Layout represents layout settings in Firebase.
type Layout struct {
	HideTutorials      bool    `json:"hideTutorials"`
	LocalMarketDisplay *string `json:"localMarketDisplay"`
	LocalOrderDisplay  *string `json:"localOrderDisplay"`
	EsiJobTab          *string `json:"esiJobTab"`
	EnableCompactView  bool    `json:"enableCompactView"`
}

// EditJob represents edit-job settings in Firebase.
type EditJob struct {
	DefaultMarket                  string  `json:"defaultMarket"`
	DefaultOrders                  string  `json:"defaultOrders"`
	HideCompleteMaterials          bool    `json:"hideCompleteMaterials"`
	DefaultAssetLocation           int64   `json:"defaultAssetLocation"`
	CitadelBrokersFee              float64 `json:"citadelBrokersFee"`
	DefaultMaterialEfficiencyValue int     `json:"defaultMaterialEfficiencyValue"`
}

// Structures represents custom structures in Firebase.
type Structures struct {
	Manufacturing []models.CustomStructure       `json:"manufacturing"`
	Reaction      []models.CustomStructure       `json:"reaction"`
	Reprocessing  []models.ReprocessingStructure `json:"reprocessing"`
}

// ReprocessingSettings represents reprocessing calculation settings in Firebase.
type ReprocessingSettings struct {
	PreferCompressed           bool    `json:"preferCompressed"`
	CompressionBonusMultiplier float64 `json:"compressionBonusMultiplier"`
	ValueMultiplier            float64 `json:"valueMultiplier"`
	WastePenaltyMultiplier     float64 `json:"wastePenaltyMultiplier"`
	SellExcessMineralTypes     bool    `json:"sellExcessMineralTypes"`
}

// ExtraCategory represents an extra cost category in Firebase.
type ExtraCategory struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Deleted   bool   `json:"deleted"`
	DeletedAt *int64 `json:"deletedAt"`
}
