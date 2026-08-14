package mongo

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// ClientBulk accumulates cross-namespace writes for one client.BulkWrite call.
type ClientBulk struct {
	client *mongo.Client
	writes []mongo.ClientBulkWrite
	err    error
}

type bulkOpt func(*bulkOpConfig)

type bulkOpConfig struct {
	upsert       bool
	arrayFilters []any
}

// Upsert marks an UpdateOne / ReplaceOne as upsert.
func Upsert() bulkOpt {
	return func(c *bulkOpConfig) { c.upsert = true }
}

// ArrayFilters sets array filters on UpdateOne / UpdateMany.
func ArrayFilters(filters ...any) bulkOpt {
	return func(c *bulkOpConfig) { c.arrayFilters = filters }
}

func (b *ClientBulk) fail(err error) *ClientBulk {
	if b.err == nil {
		b.err = err
	}
	return b
}

func (b *ClientBulk) appendDocs(docs *Docs, model mongo.ClientWriteModel) *ClientBulk {
	if b.err != nil {
		return b
	}
	if docs == nil || docs.coll == nil {
		return b.fail(fmt.Errorf("docs is required"))
	}
	if model == nil {
		return b.fail(fmt.Errorf("write model is required"))
	}
	coll := docs.coll
	b.writes = append(b.writes, mongo.ClientBulkWrite{
		Database:   coll.Database().Name(),
		Collection: coll.Name(),
		Model:      model,
	})
	return b
}

// Len returns the number of pending write models.
func (b *ClientBulk) Len() int {
	if b == nil {
		return 0
	}
	return len(b.writes)
}

// UpdateOne appends a client update-one against docs' collection.
func (b *ClientBulk) UpdateOne(docs *Docs, filter, update any, opts ...bulkOpt) *ClientBulk {
	cfg := bulkOpConfig{}
	for _, opt := range opts {
		opt(&cfg)
	}
	m := mongo.NewClientUpdateOneModel().SetFilter(filter).SetUpdate(update)
	if cfg.upsert {
		m.SetUpsert(true)
	}
	if len(cfg.arrayFilters) > 0 {
		m.SetArrayFilters(cfg.arrayFilters)
	}
	return b.appendDocs(docs, m)
}

// UpdateMany appends a client update-many against docs' collection.
func (b *ClientBulk) UpdateMany(docs *Docs, filter, update any, opts ...bulkOpt) *ClientBulk {
	cfg := bulkOpConfig{}
	for _, opt := range opts {
		opt(&cfg)
	}
	m := mongo.NewClientUpdateManyModel().SetFilter(filter).SetUpdate(update)
	if cfg.upsert {
		m.SetUpsert(true)
	}
	if len(cfg.arrayFilters) > 0 {
		m.SetArrayFilters(cfg.arrayFilters)
	}
	return b.appendDocs(docs, m)
}

// InsertOne appends a client insert-one against docs' collection.
func (b *ClientBulk) InsertOne(docs *Docs, doc any) *ClientBulk {
	return b.appendDocs(docs, mongo.NewClientInsertOneModel().SetDocument(doc))
}

// ReplaceOne appends a client replace-one against docs' collection.
func (b *ClientBulk) ReplaceOne(docs *Docs, filter, replacement any, opts ...bulkOpt) *ClientBulk {
	cfg := bulkOpConfig{}
	for _, opt := range opts {
		opt(&cfg)
	}
	m := mongo.NewClientReplaceOneModel().SetFilter(filter).SetReplacement(replacement)
	if cfg.upsert {
		m.SetUpsert(true)
	}
	return b.appendDocs(docs, m)
}

// DeleteOne appends a client delete-one against docs' collection.
func (b *ClientBulk) DeleteOne(docs *Docs, filter any) *ClientBulk {
	return b.appendDocs(docs, mongo.NewClientDeleteOneModel().SetFilter(filter))
}

// DeleteMany appends a client delete-many against docs' collection.
func (b *ClientBulk) DeleteMany(docs *Docs, filter any) *ClientBulk {
	return b.appendDocs(docs, mongo.NewClientDeleteManyModel().SetFilter(filter))
}

// RunOrdered executes pending writes with ordered=true (stop on first error).
func (b *ClientBulk) RunOrdered(ctx context.Context) (*mongo.ClientBulkWriteResult, error) {
	return b.run(ctx, true)
}

// RunUnordered executes pending writes with ordered=false.
func (b *ClientBulk) RunUnordered(ctx context.Context) (*mongo.ClientBulkWriteResult, error) {
	return b.run(ctx, false)
}

func (b *ClientBulk) run(ctx context.Context, ordered bool) (*mongo.ClientBulkWriteResult, error) {
	if b == nil {
		return nil, fmt.Errorf("client bulk is nil")
	}
	if b.err != nil {
		return nil, b.err
	}
	if b.client == nil {
		return nil, fmt.Errorf("mongo client is required")
	}
	if len(b.writes) == 0 {
		return &mongo.ClientBulkWriteResult{}, nil
	}
	return b.client.BulkWrite(ctx, b.writes, options.ClientBulkWrite().SetOrdered(ordered))
}
