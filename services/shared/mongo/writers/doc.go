// Package writers holds writes that span collections as one unit, each built as a ClientBulk and run
// through [RunOrdered] rather than assembled at a handler.
package writers
