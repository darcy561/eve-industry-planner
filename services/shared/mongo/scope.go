package mongo

// Ownership field paths, so a filter and the document it must match cannot drift
// apart: a query naming the wrong path matches nothing and reports no error.
//
// Every scoped document carries the owner in the same place, derived rows
// included, so one pair of names covers the whole database.
const (
	// FieldMetaOwner is the owner block itself, for a query that groups on the
	// pair rather than filtering on one of them. Kind and id only mean something
	// together, so grouping on the block keeps them paired.
	FieldMetaOwner = "_meta.owner"

	FieldMetaOwnerKind = "_meta.owner.kind"
	FieldMetaOwnerID   = "_meta.owner.id"
)
