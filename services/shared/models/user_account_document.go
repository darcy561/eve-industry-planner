package models

import (
	"strings"
	"time"
)

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
	RefreshTokens              []RefreshToken `bson:"refreshTokens" json:"refreshTokens,omitempty"`
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
				Owner:        AccountOwner(accountID),
				LastModified: now,
			},
			CreatedAt:   now,
			LastLoginAt: now,
		},
	}
}

// StripRefreshTokenSecretsForTransport removes OAuth secrets from transport payloads.
// For cloud accounts it keeps one row per linked character with CharacterHash only (same roster signal as
// GET /oauth-credentials); for non-cloud it drops refreshTokens entirely.
func (u *UserAccountDocument) StripRefreshTokenSecretsForTransport() {
	if u == nil {
		return
	}
	if !u.UserCloudAccounts {
		u.RefreshTokens = nil
		return
	}
	out := make([]RefreshToken, 0, len(u.RefreshTokens))
	for _, t := range u.RefreshTokens {
		h := strings.TrimSpace(t.CharacterHash)
		if h == "" {
			continue
		}
		out = append(out, RefreshToken{CharacterHash: h})
	}
	u.RefreshTokens = out
}
