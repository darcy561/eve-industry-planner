package plannersession

import (
	"encoding/json"
	"time"

	"eve-industry-planner/shared/models"
)

// CorporationIDs unmarshals JSON number arrays for refresh-token metadata; invalid shapes become empty.
type CorporationIDs []int64

func (c *CorporationIDs) UnmarshalJSON(data []byte) error {
	var ints []int64
	if err := json.Unmarshal(data, &ints); err != nil {
		*c = CorporationIDs{}
		return nil
	}
	*c = CorporationIDs(ints)
	return nil
}

// AllianceIDs unmarshals like CorporationIDs (numeric EVE alliance ids).
type AllianceIDs []int64

func (a *AllianceIDs) UnmarshalJSON(data []byte) error {
	var ints []int64
	if err := json.Unmarshal(data, &ints); err != nil {
		*a = AllianceIDs{}
		return nil
	}
	*a = AllianceIDs(ints)
	return nil
}

// RefreshTokenData is metadata bound to a planner app session refresh token in Redis (not ESI OAuth refresh material).
type RefreshTokenData struct {
	CharacterHash string         `json:"character_hash"`
	AccountID     string         `json:"account_id"`
	Scopes        []string       `json:"scopes"`
	Corporations  CorporationIDs `json:"corporations,omitempty"` // Corporation IDs the user can access
	Alliances     AllianceIDs    `json:"alliances,omitempty"`    // Alliance IDs derived from character affiliation
	SessionID     string         `json:"session_id,omitempty"`
	SessionStart  time.Time      `json:"session_start,omitzero"`
	SessionSeenAt time.Time      `json:"session_seen_at,omitzero"`
	AppVersion    string         `json:"app_version,omitempty"`
}

// Session is one planner session: a browser that logged in once and holds a
// refresh token.
type Session struct {
	SessionID        string               `json:"session_id"`
	CharacterHash    string               `json:"character_hash"`
	AppVersion       string               `json:"app_version,omitempty"`
	StartedAt        time.Time            `json:"started_at"`
	LastSeenAt       time.Time            `json:"last_seen_at"`
	ReauthRequiredAt time.Time            `json:"reauth_required_at"`
	RevokedAt        *time.Time           `json:"revoked_at,omitempty"`
	Grants           models.SessionGrants `json:"grants"`
}

// AccountRecord is every session one account holds, stored as a single row.
type AccountRecord struct {
	AccountID     string               `json:"account_id"`
	Grants        models.SessionGrants `json:"grants"`
	Sessions      map[string]Session   `json:"sessions"`
	GrantsVersion int64                `json:"grants_version,omitzero"`
	UpdatedAt     time.Time            `json:"updated_at"`
}
