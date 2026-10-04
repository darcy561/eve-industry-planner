package models

import "time"

// MetaData is the shared `_meta` block every scoped document carries.
type MetaData struct {
	LastModified time.Time `bson:"lastModified" json:"lastModified"`
	Owner        Owner     `bson:"owner" json:"-"`
	Revision     int64     `bson:"revision,omitempty" json:"revision,omitempty"`
	ClientID     string    `bson:"clientID,omitempty" json:"clientID,omitempty"`
	SessionID    string    `bson:"sessionID,omitempty" json:"sessionID,omitempty"`
}

// MetaFieldOwner is the `_meta` key holding the owner, for the changestream,
// which reads a raw subdocument with no struct to decode into.
const MetaFieldOwner = "owner"

// MetaFieldRevision is the `_meta` key holding the write counter.
const MetaFieldRevision = "revision"

// MetaFieldName is the key a document holds its metadata under.
const MetaFieldName = "_meta"

// MetaFieldLastModified is the `_meta` key holding when the document was last written.
const MetaFieldLastModified = "lastModified"

// MetaFieldClientID is the `_meta` key holding the websocket client a write came from.
const MetaFieldClientID = "clientID"

// MetaFieldSessionID is the `_meta` key holding the planner session a write came from.
const MetaFieldSessionID = "sessionID"

// InitialDocumentRevision is the revision a document is seeded with.
const InitialDocumentRevision int64 = 1
