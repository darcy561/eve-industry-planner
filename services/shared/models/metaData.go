package models

import "time"

// MetaData is the shared `_meta` account/ownership block for private account documents
// (users, application_settings, user_job_groups, jobs, etc.). ClientID is the WebSocket
// tab id (X-WS-Client-ID) for the write that last touched the document, for changestream
// / WS echo suppression.
type MetaData struct {
	LastModified time.Time `bson:"lastModified" json:"lastModified"`
	AccountID    string    `bson:"accountID" json:"accountID"`
	ClientID     string    `bson:"clientID,omitempty" json:"clientID,omitempty"`
	SessionID    string    `bson:"sessionID,omitempty" json:"sessionID,omitempty"`
	// Org ownership for documents that are not account scoped. The changestream
	// routes on these when AccountID is absent.
	CorporationRef string `bson:"corporationRef,omitempty" json:"-"`
	AllianceRef    string `bson:"allianceRef,omitempty" json:"-"`
}

// Field names the changestream reads out of a raw _meta subdocument, where it has
// no struct to decode into.
const (
	MetaFieldCorporationRef = "corporationRef"
	MetaFieldAllianceRef    = "allianceRef"
)
