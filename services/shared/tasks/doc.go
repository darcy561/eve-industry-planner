// Package tasks is the single place for worker task definitions: name (handler key),
// NATS subject, and default priority. When creating messages use Task vars (e.g. MigrateUserDocumentToMongo,
// RefreshSystemIndexes) with natscore.PublishTask(js, task.Subject, task.Name, payload, opts...).
package tasks
