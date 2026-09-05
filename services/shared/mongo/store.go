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
	Users               *Docs
	JobDocuments        *Docs // CollectionJobDocuments — planner job docs API (hot path)
	Jobs                *Docs // CollectionJobs — distinct from JobDocuments; not the user job-docs API
	Groups              *Docs
	ArchivedJobs        *Docs
	StatisticsTotals    *Docs
	TemplateCatalog     *Docs
	TemplatePayloads    *Docs
	ApplicationSettings *Docs
	Blueprints          *Docs
	CitadelNames        *Docs
	WatchlistDeprecated *Docs

	StatisticsRows          *Docs // per-archived-job figures the statistics pipelines read
	StatisticsTimeline      *Docs // pre-aggregated calendar months per owner and item type
	StatisticsRebuildQueue  *Docs // owners whose statistics need recalculating
	StatisticsReconcileRota *Docs // when each owner was last reconciled against its rows
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
	m.JobDocuments = m.Docs(CollectionJobDocuments)
	m.Jobs = m.Docs(CollectionJobs)
	m.Groups = m.Docs(CollectionJobGroups)
	m.ArchivedJobs = m.Docs(CollectionArchivedJobs)
	m.StatisticsTotals = m.Docs(CollectionStatisticsTotals)
	m.TemplateCatalog = m.Docs(CollectionGroupTemplateCatalog)
	m.TemplatePayloads = m.Docs(CollectionGroupTemplatePayloads)
	m.ApplicationSettings = m.Docs(CollectionAccountSettings)
	m.Blueprints = m.Docs(CollectionSharedBlueprints)
	m.CitadelNames = m.Docs(CollectionSharedCitadelNames)
	m.WatchlistDeprecated = m.Docs(CollectionWatchlistDeprecated)
	m.StatisticsRows = m.Docs(CollectionStatisticsRows)
	m.StatisticsTimeline = m.Docs(CollectionStatisticsTimeline)
	m.StatisticsRebuildQueue = m.Docs(CollectionStatisticsRebuildQueue)
	m.StatisticsReconcileRota = m.Docs(CollectionStatisticsReconcileRota)
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
