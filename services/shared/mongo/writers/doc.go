// Package writers holds multi-collection Mongo write units built on [eipmongo.Mongo.Bulk].
//
// Convention for new work:
//   - Same-collection reads/writes stay on Docs methods ([eipmongo.Mongo] fields).
//   - Cross-collection writes go through a writer here (or a new file in this package).
//   - Writers own ClientBulk assembly plus [eipmongo.Retry] on Run*; callers map domain
//     errors (duplicate key, not found) to HTTP/task outcomes with errors.Is /
//     mongo.IsDuplicateKeyError.
//
// Expand by adding a focused file per product unit (e.g. another catalog+payload pair),
// reusing [RunOrdered] / [RunUnordered] rather than calling Bulk from handlers/workers.
package writers
