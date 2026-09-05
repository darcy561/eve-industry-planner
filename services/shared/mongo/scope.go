package mongo

// Ownership field paths, so a filter and the document it must match cannot drift
// apart: a query naming the wrong path matches nothing and reports no error.
//
// Every scoped document carries the owner in the same place, derived rows
// included, so one pair of names covers the whole database.
const (
	FieldMetaOwnerKind = "_meta.owner.kind"
	FieldMetaOwnerID   = "_meta.owner.id"
)
