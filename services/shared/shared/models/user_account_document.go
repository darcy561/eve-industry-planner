package models

import "time"

// UserMeta is user document metadata stored under BSON/JSON `_meta`, aligned with Job.JobMetaData
// (shared MetaData for accountID + lastModified; additional lifecycle fields on the struct).
type UserMeta struct {
	MetaData    `json:",inline" bson:",inline"`
	CreatedAt   time.Time  `json:"createdAt" bson:"createdAt"`
	LastLoginAt time.Time  `json:"lastLoginAt" bson:"lastLoginAt"`
	DeletedAt   *time.Time `json:"deletedAt,omitempty" bson:"deletedAt,omitempty"`
}

// UserAccountDocument represents a user document in the users collection.
type UserAccountDocument struct {
	SchemaVersion              int            `bson:"schemaVersion,omitempty" json:"schemaVersion,omitempty"`
	LinkedJobs                 []int64        `bson:"linkedJobs" json:"linkedJobs"`
	LinkedTrans                []int64        `bson:"linkedTrans" json:"linkedTrans"`
	LinkedOrders               []int64        `bson:"linkedOrders" json:"linkedOrders"`
	UserCloudAccounts          bool           `bson:"userCloudAccounts" json:"userCloudAccounts"`
	HasCompletedFirstLoginFlow bool           `bson:"hasCompletedFirstLoginFlow" json:"hasCompletedFirstLoginFlow"`
	ShareCitadelNames          bool           `bson:"shareCitadelNames" json:"shareCitadelNames"`
	RefreshTokens              []RefreshToken `bson:"refreshTokens" json:"refreshTokens"`
	MetaData                   UserMeta       `bson:"_meta" json:"_meta"`
}

// DefaultUserAccountDocument returns a full new-account users document for Mongo.
func DefaultUserAccountDocument(accountID string, now time.Time) UserAccountDocument {
	return UserAccountDocument{
		SchemaVersion:              UserAccountDocumentSchemaCurrent,
		LinkedJobs:                 []int64{},
		LinkedTrans:                []int64{},
		LinkedOrders:               []int64{},
		UserCloudAccounts:          false,
		HasCompletedFirstLoginFlow: false,
		ShareCitadelNames:          true,
		RefreshTokens:              []RefreshToken{},
		MetaData: UserMeta{
			MetaData: MetaData{
				AccountID:    accountID,
				LastModified: now,
			},
			CreatedAt:   now,
			LastLoginAt: now,
		},
	}
}

// StripRefreshTokenSecretsForTransport removes all refresh-token material from the user
// document while preserving CharacterHash entries so clients can reconcile linked alts
// without receiving secrets over WebSocket or HTTP GET.
func (u *UserAccountDocument) StripRefreshTokenSecretsForTransport() {
	if u == nil {
		return
	}
	out := make([]RefreshToken, 0, len(u.RefreshTokens))
	for _, t := range u.RefreshTokens {
		if t.CharacterHash == "" {
			continue
		}
		out = append(out, RefreshToken{CharacterHash: t.CharacterHash})
	}
	u.RefreshTokens = out
}
