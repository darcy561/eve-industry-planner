package models

import "time"

// MetaData is the shared `_meta` block every scoped document carries.
//
// ClientID is the WebSocket tab id (X-WS-Client-ID) of the write that last
// touched the document, for changestream / WS echo suppression.
//
// Owner has no JSON tag deliberately: for the org kinds its id is a ref, so a
// response naming an owner builds a handle instead.
// Revision counts writes to this document, which is what a conditional write
// compares — not the shape of the document, which is the model's own
// SchemaVersion.
//
// Stored it is never zero: a document is inserted at [InitialDocumentRevision]
// and only ever incremented. Zero here is a document that was decoded without
// one, which a conditional write must not treat as a value to compare — Mongo
// matches a missing field on null, not on zero, so such a filter would match
// nothing rather than conflict.
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

// InitialDocumentRevision is the revision a document is seeded with.
const InitialDocumentRevision int64 = 1
