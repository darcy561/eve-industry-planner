package mongo

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
)

// InTransaction runs fn as one transaction, committing what it wrote only when it returns nil.
// fn runs again whenever the server asks for a retry, so it must start from nothing each time.
func (m *Mongo) InTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	if m == nil || m.Client == nil {
		return fmt.Errorf("mongo client is required")
	}
	session, err := m.Client.StartSession()
	if err != nil {
		return fmt.Errorf("start a session: %w", err)
	}
	defer session.EndSession(context.WithoutCancel(ctx))

	_, err = session.WithTransaction(ctx, func(txCtx context.Context) (any, error) {
		return nil, fn(txCtx)
	}, options.Transaction().
		SetReadConcern(readconcern.Snapshot()).
		SetWriteConcern(writeconcern.Majority()))
	return err
}

// inTransaction reports whether ctx carries a transaction that has not yet committed or aborted.
func inTransaction(ctx context.Context) bool {
	session := mongo.SessionFromContext(ctx)
	return session != nil && session.TransactionRunning()
}
