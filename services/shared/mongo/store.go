package mongo

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

// Mongo is the app mongo handle: one client, pinned database, pre-bound Docs, Bulk.
type Mongo struct {
	Client *mongo.Client
	DB     *mongo.Database

	// Named collection handles (bound in NewMongo).
	Users                   *Docs
	JobDocuments            *Docs // CollectionAccountJobDocuments — planner job docs API (hot path)
	Jobs                    *Docs // CollectionAccountJobs — distinct from JobDocuments; not the user job-docs API
	Groups                  *Docs
	ArchivedJobs            *Docs
	AccountProductionTotals *Docs
	TemplateCatalog         *Docs
	TemplatePayloads        *Docs
	ApplicationSettings     *Docs
	Blueprints              *Docs
	CitadelNames            *Docs
	WatchlistDeprecated     *Docs

	ArchivedJobStats      *Docs // per-archived-job figures the statistics pipelines read
	AccountTimelineMonths *Docs // pre-aggregated calendar months per account and item type
	AccountRebuildQueue   *Docs // accounts whose statistics need recalculating
	AccountReconcileRota  *Docs // when each owner was last reconciled against its rows
}

// NewMongo pins DatabaseName and binds named Docs fields. client must be non-nil.
func NewMongo(client *mongo.Client) (*Mongo, error) {
	if client == nil {
		return nil, fmt.Errorf("mongo client is required")
	}
	m := &Mongo{
		Client: client,
		DB:     client.Database(DatabaseName),
	}
	m.Users = m.Docs(CollectionAccounts)
	m.JobDocuments = m.Docs(CollectionAccountJobDocuments)
	m.Jobs = m.Docs(CollectionAccountJobs)
	m.Groups = m.Docs(CollectionAccountJobGroups)
	m.ArchivedJobs = m.Docs(CollectionAccountArchivedJobs)
	m.AccountProductionTotals = m.Docs(CollectionAccountProductionTotals)
	m.TemplateCatalog = m.Docs(CollectionAccountGroupTemplateCatalog)
	m.TemplatePayloads = m.Docs(CollectionAccountGroupTemplatePayloads)
	m.ApplicationSettings = m.Docs(CollectionAccountSettings)
	m.Blueprints = m.Docs(CollectionSharedBlueprints)
	m.CitadelNames = m.Docs(CollectionSharedCitadelNames)
	m.WatchlistDeprecated = m.Docs(CollectionAccountWatchlistDeprecated)
	m.ArchivedJobStats = m.Docs(CollectionArchivedJobStats)
	m.AccountTimelineMonths = m.Docs(CollectionAccountTimelineMonths)
	m.AccountRebuildQueue = m.Docs(CollectionAccountRebuildQueue)
	m.AccountReconcileRota = m.Docs(CollectionAccountReconcileRota)
	return m, nil
}

// Ping verifies the connection.
func (m *Mongo) Ping(ctx context.Context) error {
	if m == nil || m.Client == nil {
		return fmt.Errorf("mongo client is required")
	}
	return m.Client.Ping(ctx, nil)
}

// Disconnect closes the underlying client.
func (m *Mongo) Disconnect(ctx context.Context) {
	if m == nil || m.Client == nil {
		return
	}
	_ = m.Client.Disconnect(ctx)
}

// Coll returns a raw driver collection (escape hatch). Prefer named Docs fields.
func (m *Mongo) Coll(name string) *mongo.Collection {
	if m == nil || m.DB == nil {
		return nil
	}
	return m.DB.Collection(name)
}

// Docs returns a collection-bound helper API (for rare/dynamic names).
func (m *Mongo) Docs(name string) *Docs {
	return newDocs(m.Coll(name))
}

// Bulk starts a cross-collection client bulk write buffer.
func (m *Mongo) Bulk() *ClientBulk {
	if m == nil {
		return &ClientBulk{}
	}
	return &ClientBulk{client: m.Client}
}
