package model

// RealtimeScopes holds optional non-account routing scopes for a WebSocket connection.
// Account-wide delivery uses Client.AccountID; corporation and alliance lists are
// populated when those features ship (membership verified at connect or refresh).
type RealtimeScopes struct {
	CorporationIDs []string
	AllianceIDs    []string
}
