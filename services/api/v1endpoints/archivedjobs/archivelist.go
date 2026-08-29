package archivedjobs

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// archivedJobSortFields maps an accepted sort value to the document field it
// orders by; validating against it keeps caller input out of the $sort key.
var archivedJobSortFields = map[string]string{
	"archivedAt": "_meta.archivedAt",
	"name":       "name",
	"itemID":     "itemID",
	"jobType":    "jobType",
}

// DefaultArchivedJobSort orders newest first.
const DefaultArchivedJobSort = "archivedAt"

// ArchivedJobSortable reports whether the list orders by this field.
func ArchivedJobSortable(field string) bool {
	_, ok := archivedJobSortFields[field]
	return ok
}

// ArchivedJobSortableFields lists accepted sort fields, sorted for stable errors.
func ArchivedJobSortableFields() []string {
	out := make([]string, 0, len(archivedJobSortFields))
	for field := range archivedJobSortFields {
		out = append(out, field)
	}
	slices.Sort(out)
	return out
}

// ArchivedJobQuery narrows an archive to the rows a list page draws. Every field
// but Scope is optional; the zero query reads the whole archive.
type ArchivedJobQuery struct {
	Scope archiveScope
	// From and To bound the archive month inclusively; zero months are open ends.
	From eipmongo.MonthKey
	To   eipmongo.MonthKey
	// TypeID, GroupID and Search each narrow further when set.
	TypeID  int
	GroupID string
	Search  string
}

func (q ArchivedJobQuery) filter() bson.M {
	filter := q.Scope.filter()

	if !q.From.IsZero() || !q.To.IsZero() {
		archivedAt := bson.M{}
		if !q.From.IsZero() {
			archivedAt["$gte"] = q.From.Start()
		}
		if !q.To.IsZero() {
			// Exclusive bound on the next month, so all of To is included.
			archivedAt["$lt"] = q.To.AddMonths(1).Start()
		}
		filter["_meta.archivedAt"] = archivedAt
	}
	if q.TypeID > 0 {
		filter["itemID"] = q.TypeID
	}
	if q.GroupID != "" {
		filter["groupID"] = q.GroupID
	}
	if search := strings.TrimSpace(q.Search); search != "" {
		filter["name"] = bson.M{"$regex": regexp.QuoteMeta(search), "$options": "i"}
	}
	return filter
}

// ArchivedJobSummary is one archived job reduced to what a list row draws. The
// money figures live on the statistics row and are merged by the caller.
type ArchivedJobSummary struct {
	JobID      string    `bson:"jobID"`
	Name       string    `bson:"name"`
	ItemID     int       `bson:"itemID"`
	JobType    int       `bson:"jobType"`
	GroupID    string    `bson:"groupID"`
	ArchivedAt time.Time `bson:"-"`
	// ChildJobs is keyed by material type id.
	ParentJobs []string            `bson:"parentJobs"`
	ChildJobs  map[string][]string `bson:"-"`

	// Meta and Build hold the nested projection; normalise lifts them out.
	Meta  models.JobMetaData `bson:"_meta"`
	Build struct {
		ChildJobs map[string][]string `bson:"childJobs"`
	} `bson:"build"`
}

// normalise lifts the nested projection onto the flat fields.
func (s *ArchivedJobSummary) normalise() {
	s.ArchivedAt = s.Meta.ArchivedAt
	s.ChildJobs = s.Build.ChildJobs
}

// RelatedJobIDs returns every job this one links to, parents and children alike.
func (s ArchivedJobSummary) RelatedJobIDs() []string {
	out := make([]string, 0, len(s.ParentJobs))
	out = append(out, s.ParentJobs...)
	for _, children := range s.ChildJobs {
		out = append(out, children...)
	}
	return out
}

// archivedJobSummaryProjection reads the summary fields only; a full archived
// job carries its whole build and every sale line.
var archivedJobSummaryProjection = bson.M{
	"jobID":            1,
	"name":             1,
	"itemID":           1,
	"jobType":          1,
	"groupID":          1,
	"parentJobs":       1,
	"build.childJobs":  1,
	"_meta.archivedAt": 1,
}

// ArchivedJobPage is one page of the list.
type ArchivedJobPage struct {
	Jobs []ArchivedJobSummary
	// TotalJobs is every job matched, not the page length.
	TotalJobs int
}

// listArchivedJobs reads a page of an archive, sorted and paged in Mongo.
func listArchivedJobs(ctx context.Context, query ArchivedJobQuery, sortField string, ascending bool, limit, offset int) (ArchivedJobPage, error) {
	if query.Scope.OwnerID == "" {
		return ArchivedJobPage{}, fmt.Errorf("archive scope owner is required")
	}
	if sortField == "" {
		sortField = DefaultArchivedJobSort
	}
	field, ok := archivedJobSortFields[sortField]
	if !ok {
		return ArchivedJobPage{}, fmt.Errorf("unsupported sort field %q", sortField)
	}
	coll, err := query.Scope.jobsCollection()
	if err != nil {
		return ArchivedJobPage{}, err
	}

	direction := -1
	if ascending {
		direction = 1
	}
	filter := query.filter()

	var page ArchivedJobPage
	err = eipmongo.Retry(ctx, "list archived jobs", func() error {
		page = ArchivedJobPage{}

		total, countErr := coll.CountDocuments(ctx, filter)
		if countErr != nil {
			return countErr
		}
		page.TotalJobs = int(total)

		findOpts := options.Find().
			SetProjection(archivedJobSummaryProjection).
			// jobID breaks ties so paging is stable.
			SetSort(bson.D{{Key: field, Value: direction}, {Key: "jobID", Value: 1}}).
			SetSkip(int64(offset)).
			SetLimit(int64(limit))

		cursor, findErr := coll.Find(ctx, filter, findOpts)
		if findErr != nil {
			return findErr
		}
		defer cursor.Close(ctx)

		var rows []ArchivedJobSummary
		if allErr := cursor.All(ctx, &rows); allErr != nil {
			return allErr
		}
		for i := range rows {
			rows[i].normalise()
		}
		page.Jobs = rows
		return nil
	})
	if err != nil {
		return ArchivedJobPage{}, err
	}
	return page, nil
}

// loadArchivedJob reads one archived job in full, returning nil with no error
// when the archive holds no such job.
func loadArchivedJob(ctx context.Context, scope archiveScope, jobID string) (*models.Job, error) {
	if jobID == "" {
		return nil, fmt.Errorf("jobID is required")
	}
	coll, err := scope.jobsCollection()
	if err != nil {
		return nil, err
	}

	filter := scope.filter()
	filter["jobID"] = jobID

	var out *models.Job
	err = eipmongo.Retry(ctx, "load archived job", func() error {
		out = nil
		var job models.Job
		if decodeErr := coll.FindOne(ctx, filter).Decode(&job); decodeErr != nil {
			if errors.Is(decodeErr, mongodriver.ErrNoDocuments) {
				return nil
			}
			return decodeErr
		}
		out = &job
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// loadArchivedJobStatsByJobIDs reads statistics rows by _id. A job with no row
// is omitted rather than zeroed: the rebuild has not folded it yet.
func loadArchivedJobStatsByJobIDs(ctx context.Context, scope archiveScope, jobIDs []string) (map[string]models.ArchivedJobStats, error) {
	if len(jobIDs) == 0 {
		return map[string]models.ArchivedJobStats{}, nil
	}
	coll, err := scope.statsCollection()
	if err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(jobIDs))
	for _, jobID := range jobIDs {
		if jobID == "" {
			continue
		}
		ids = append(ids, scope.statsID(jobID))
	}

	out := make(map[string]models.ArchivedJobStats, len(ids))
	err = eipmongo.Retry(ctx, "load archived job stats", func() error {
		clear(out)
		cursor, findErr := coll.Find(ctx, bson.M{"_id": bson.M{"$in": ids}})
		if findErr != nil {
			return findErr
		}
		defer cursor.Close(ctx)

		var rows []models.ArchivedJobStats
		if allErr := cursor.All(ctx, &rows); allErr != nil {
			return allErr
		}
		for _, row := range rows {
			// Revoked rows describe jobs the rebuild has superseded.
			if row.Revoked {
				continue
			}
			out[row.JobID] = row
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// loadArchivedJobsByFilter reads whole archived documents, unprojected: restore
// writes what comes back straight into the planner.
func loadArchivedJobsByFilter(ctx context.Context, query ArchivedJobQuery) ([]models.Job, error) {
	if query.Scope.OwnerID == "" {
		return nil, fmt.Errorf("archive scope owner is required")
	}
	coll, err := query.Scope.jobsCollection()
	if err != nil {
		return nil, err
	}

	var out []models.Job
	err = eipmongo.Retry(ctx, "load archived jobs", func() error {
		out = nil
		cursor, findErr := coll.Find(ctx, query.filter())
		if findErr != nil {
			return findErr
		}
		defer cursor.Close(ctx)
		return cursor.All(ctx, &out)
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// loadArchivedJobsByIDs reads named archived documents in full.
func loadArchivedJobsByIDs(ctx context.Context, scope archiveScope, jobIDs []string) ([]models.Job, error) {
	if len(jobIDs) == 0 {
		return nil, nil
	}
	coll, err := scope.jobsCollection()
	if err != nil {
		return nil, err
	}

	filter := scope.filter()
	filter["jobID"] = bson.M{"$in": jobIDs}

	var out []models.Job
	err = eipmongo.Retry(ctx, "load archived jobs by id", func() error {
		out = nil
		cursor, findErr := coll.Find(ctx, filter)
		if findErr != nil {
			return findErr
		}
		defer cursor.Close(ctx)
		return cursor.All(ctx, &out)
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// listAllArchivedSummaries reads the whole archive as summaries, which is the
// span a related-set walk needs.
func listAllArchivedSummaries(ctx context.Context, scope archiveScope) ([]ArchivedJobSummary, error) {
	coll, err := scope.jobsCollection()
	if err != nil {
		return nil, err
	}

	var rows []ArchivedJobSummary
	err = eipmongo.Retry(ctx, "list archived job summaries", func() error {
		rows = nil
		cursor, findErr := coll.Find(ctx, scope.filter(),
			options.Find().SetProjection(archivedJobSummaryProjection))
		if findErr != nil {
			return findErr
		}
		defer cursor.Close(ctx)
		if allErr := cursor.All(ctx, &rows); allErr != nil {
			return allErr
		}
		for i := range rows {
			rows[i].normalise()
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return rows, nil
}
