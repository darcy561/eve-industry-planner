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
	JobDocuments        *Docs // CollectionUserJobDocuments — planner job docs API (hot path)
	Jobs                *Docs // CollectionJobs — distinct from JobDocuments; not the user job-docs API
	Groups              *Docs
	ArchivedJobs        *Docs
	BuildStats          *Docs
	TemplateCatalog     *Docs
	TemplatePayloads    *Docs
	ApplicationSettings *Docs
	Blueprints          *Docs
	CitadelNames        *Docs
	WatchlistDeprecated *Docs

	ArchivedJobStats    *Docs // per-archived-job figures the statistics pipelines read
	UserRollupBuckets   *Docs // pre-aggregated calendar months per account and item type
	AccountRebuildQueue *Docs // accounts whose statistics need recalculating
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
	m.Users = m.Docs(CollectionUsers)
	m.JobDocuments = m.Docs(CollectionUserJobDocuments)
	m.Jobs = m.Docs(CollectionJobs)
	m.Groups = m.Docs(CollectionUserJobGroups)
	m.ArchivedJobs = m.Docs(CollectionArchivedJobs)
	m.BuildStats = m.Docs(CollectionBuildStats)
	m.TemplateCatalog = m.Docs(CollectionUserGroupTemplateCatalog)
	m.TemplatePayloads = m.Docs(CollectionUserGroupTemplatePayloads)
	m.ApplicationSettings = m.Docs(CollectionApplicationSettings)
	m.Blueprints = m.Docs(CollectionBlueprints)
	m.CitadelNames = m.Docs(CollectionCitadelNames)
	m.WatchlistDeprecated = m.Docs(CollectionUserWatchlistDeprecated)
	m.ArchivedJobStats = m.Docs(CollectionArchivedJobStats)
	m.UserRollupBuckets = m.Docs(CollectionUserRollupBuckets)
	m.AccountRebuildQueue = m.Docs(CollectionAccountRebuildQueue)
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
