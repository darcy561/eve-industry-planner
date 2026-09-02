package mongo

import (
	"context"
	"fmt"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// MonthKey is a calendar month as the API accepts it, and as the timeline
// buckets store it.
type MonthKey struct {
	Year  int
	Month int
}

// String renders the wire form, YYYY-MM. Zero-padded so lexical order matches
// calendar order, the same reason the bucket _id is built that way.
func (m MonthKey) String() string {
	return fmt.Sprintf("%04d-%02d", m.Year, m.Month)
}

// ParseMonthKey reads the wire form, YYYY-MM.
//
// The inverse of String, kept beside it so the format has one owner: the wire
// value a caller names is the month the rows were filed under, with no second
// convention to keep in step.
func ParseMonthKey(raw string) (MonthKey, error) {
	year, month, ok := strings.Cut(raw, "-")
	if !ok || len(year) != 4 || len(month) != 2 {
		return MonthKey{}, fmt.Errorf("month must be YYYY-MM, got %q", raw)
	}
	y, yErr := strconv.Atoi(year)
	mo, mErr := strconv.Atoi(month)
	if yErr != nil || mErr != nil || mo < 1 || mo > 12 {
		return MonthKey{}, fmt.Errorf("month must be YYYY-MM, got %q", raw)
	}
	return MonthKey{Year: y, Month: mo}, nil
}

// Before reports whether m is an earlier month than other.
func (m MonthKey) Before(other MonthKey) bool {
	if m.Year != other.Year {
		return m.Year < other.Year
	}
	return m.Month < other.Month
}

// CurrentMonth is the month now falls in, in UTC.
//
// Month boundaries are UTC everywhere in this pipeline: the buckets are built
// from UTC timestamps, so resolving "this month" in a different zone would ask
// for a month the rows were never filed under.
func CurrentMonth(now time.Time) MonthKey {
	u := now.UTC()
	return MonthKey{Year: u.Year(), Month: int(u.Month())}
}

// IsZero reports whether a month key was never set, which callers read as an
// open end on a range rather than as the year zero.
func (m MonthKey) IsZero() bool {
	return m.Year == 0 && m.Month == 0
}

// Start is the first instant of the month, in UTC.
//
// UTC for the same reason CurrentMonth resolves there: the rows this bounds were
// filed against UTC timestamps, so a boundary in another zone would include or
// exclude jobs at the edges of the month.
func (m MonthKey) Start() time.Time {
	return time.Date(m.Year, time.Month(m.Month), 1, 0, 0, 0, 0, time.UTC)
}

// AddMonths shifts a month key, normalising the month into 1..12.
func (m MonthKey) AddMonths(delta int) MonthKey {
	total := m.Year*12 + (m.Month - 1) + delta
	return MonthKey{Year: total / 12, Month: total%12 + 1}
}

// TimelineQuery selects the bucket rows a timeline view reads.
type TimelineQuery struct {
	AccountID string
	From      MonthKey
	To        MonthKey
	// TypeID narrows to one item type when non-zero. Zero reads every type,
	// which is what the month-total view sums over.
	TypeID int
	// IncludeProductionChain reads an item's chain output alongside what it built
	// in its own right. A view summing spend across item types must leave it off:
	// those costs are also counted through the parent job that consumed the
	// output, so including both counts the same build twice.
	IncludeProductionChain bool
	// AllTime reads every month the account has, ignoring From and To. Separate
	// from a very wide range because a range can be refused for being too long,
	// while this is bounded by what exists.
	AllTime bool
}

// TimelineMonthRow is one calendar month summed across every item type the
// query covered.
type TimelineMonthRow struct {
	models.CalendarMonth `bson:",inline"`
	models.SalesMeasures `bson:",inline"`
}

// timelineMonthAggregateRow is a month as the pipeline returns it: summed
// measures, plus the maps it could not sum.
type timelineMonthAggregateRow struct {
	TimelineMonthRow    `bson:",inline"`
	ExtraCategoryTotals []map[string]float64 `bson:"extraCategoryTotalsList"`
}

// fold merges the collected maps into the row's own measures.
func (r timelineMonthAggregateRow) fold() TimelineMonthRow {
	row := r.TimelineMonthRow
	for _, extras := range r.ExtraCategoryTotals {
		if len(extras) == 0 {
			continue
		}
		row.SalesMeasures = row.SalesMeasures.Plus(models.SalesMeasures{ExtraCategoryTotals: extras})
	}
	return row
}

// TimelineItemRow is one item type's share of the whole window.
type TimelineItemRow struct {
	TypeID               int `bson:"typeID"`
	models.SalesMeasures `bson:",inline"`
}

// timelineRangeFilter scopes bucket rows to an account and an inclusive month
// range.
//
// The range is expressed as a comparison on the packed year*12+month ordinal
// rather than as year and month predicates, because a naive
// {year: {$gte, $lte}, month: {$gte, $lte}} spanning a year boundary excludes
// the months in between — December to February would match neither December nor
// January. The ordinal is computed in the pipeline so the stored documents keep
// their plain year and month fields.
func timelineRangeFilter(q TimelineQuery) bson.M {
	filter := bson.M{"accountID": q.AccountID}
	if q.TypeID != 0 {
		filter["typeID"] = q.TypeID
	}
	if !q.IncludeProductionChain {
		filter["isProductionChain"] = bson.M{"$ne": true}
	}
	return filter
}

// monthOrdinalExpr packs year and month into a single comparable integer.
func monthOrdinalExpr() bson.M {
	return bson.M{"$add": bson.A{bson.M{"$multiply": bson.A{"$year", 12}}, "$month"}}
}

func monthOrdinal(m MonthKey) int {
	return m.Year*12 + m.Month
}

// summableMeasureFields names every numeric measure on SalesMeasures, read from
// the struct so a measure added to the document cannot be left out of the
// aggregation — which returns zeros rather than failing.
//
// Maps are skipped by the kind test: extraCategoryTotals cannot be $summed, and a
// caller that needs it collects the maps with extraCategoryTotalsPush and folds
// them with SalesMeasures.Plus.
var summableMeasureFields = sync.OnceValue(func() []string {
	t := reflect.TypeFor[models.SalesMeasures]()
	fields := make([]string, 0, t.NumField())
	for field := range t.Fields() {
		switch field.Type.Kind() {
		case reflect.Int64, reflect.Float64:
		default:
			continue
		}
		name, _, _ := strings.Cut(field.Tag.Get("bson"), ",")
		if name == "" || name == "-" {
			continue
		}
		fields = append(fields, name)
	}
	return fields
})

// sumMeasuresGroup accumulates every additive measure in a $group stage.
//
// profitLoss is a sum of signed contributions rather than a recomputed figure, so
// summing sums is correct.
func sumMeasuresGroup(id any) bson.M {
	group := bson.M{"_id": id}
	for _, field := range summableMeasureFields() {
		group[field] = bson.M{"$sum": "$" + field}
	}
	return group
}

// extraCategoryTotalsField names the collected maps in a group that asks for them.
const extraCategoryTotalsField = "extraCategoryTotalsList"

// extraCategoryTotalsPush adds the per-category maps to a group stage. $push
// skips documents where the field is missing, so buckets carrying no extras
// collect nothing rather than a list of empty maps.
func extraCategoryTotalsPush(group bson.M) bson.M {
	group[extraCategoryTotalsField] = bson.M{"$push": "$extraCategoryTotals"}
	return group
}

// rangeMatchStages are the shared leading stages: filter by account and type on
// indexed fields first, then bound the month range on the computed ordinal.
func rangeMatchStages(q TimelineQuery) []bson.D {
	stages := []bson.D{{{Key: "$match", Value: timelineRangeFilter(q)}}}
	if q.AllTime {
		return stages
	}
	return append(stages,
		bson.D{{Key: "$addFields", Value: bson.M{"monthOrdinal": monthOrdinalExpr()}}},
		bson.D{{Key: "$match", Value: bson.M{"monthOrdinal": bson.M{
			"$gte": monthOrdinal(q.From),
			"$lte": monthOrdinal(q.To),
		}}}},
	)
}

// TimelineMonths sums an account's bucket rows into one entry per calendar
// month, ascending.
//
// The sum happens here rather than in the caller because an account can hold
// buckets for thousands of item types in a single month; shipping them to be
// folded client-side is the payload this view exists to avoid.
func (m *Mongo) TimelineMonths(ctx context.Context, q TimelineQuery, opts ...RetryOption) ([]TimelineMonthRow, error) {
	if m == nil || m.AccountTimelineMonths == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	if q.AccountID == "" {
		return nil, fmt.Errorf("accountID is required")
	}
	if !q.AllTime && q.To.Before(q.From) {
		return nil, fmt.Errorf("timeline range ends before it starts: %s to %s", q.From, q.To)
	}

	pipeline := mongo.Pipeline(append(rangeMatchStages(q),
		bson.D{{Key: "$group", Value: extraCategoryTotalsPush(sumMeasuresGroup(bson.M{"year": "$year", "month": "$month"}))}},
		bson.D{{Key: "$sort", Value: bson.D{{Key: "_id.year", Value: 1}, {Key: "_id.month", Value: 1}}}},
		bson.D{{Key: "$addFields", Value: bson.M{"year": "$_id.year", "month": "$_id.month"}}},
	))

	var rows []timelineMonthAggregateRow
	if err := m.AccountTimelineMonths.Aggregate(ctx, pipeline, &rows, append([]RetryOption{WithOpName("TimelineMonths")}, opts...)...); err != nil {
		return nil, err
	}

	out := make([]TimelineMonthRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, row.fold())
	}
	return out, nil
}

// TimelineItemsPage is one page of the per-item breakdown, with the total number
// of item types the window covered so a caller can page without a second query.
type TimelineItemsPage struct {
	Items      []TimelineItemRow
	TotalItems int
}

// TimelineItems groups an account's bucket rows by item type across the whole
// window, ranked.
//
// Ranking is server-side because it cannot be done anywhere else: ordering item
// types by profit requires every type in the window before a page can be taken,
// which is exactly the work a client cannot do from a page of arbitrary rows.
//
// sortField must be one of the additive measures; an empty value ranks by
// profitLoss descending, the ordering the dashboard reads.
func (m *Mongo) TimelineItems(ctx context.Context, q TimelineQuery, sortField string, ascending bool, limit, offset int, opts ...RetryOption) (TimelineItemsPage, error) {
	var page TimelineItemsPage
	if m == nil || m.AccountTimelineMonths == nil {
		return page, fmt.Errorf("mongo handle is required")
	}
	if q.AccountID == "" {
		return page, fmt.Errorf("accountID is required")
	}
	if !q.AllTime && q.To.Before(q.From) {
		return page, fmt.Errorf("timeline range ends before it starts: %s to %s", q.From, q.To)
	}
	if sortField == "" {
		sortField = DefaultTimelineSort
	}
	if !timelineSortable[sortField] {
		return page, fmt.Errorf("cannot sort item breakdown by %q", sortField)
	}
	if limit <= 0 {
		return page, fmt.Errorf("limit must be positive")
	}
	if offset < 0 {
		return page, fmt.Errorf("offset cannot be negative")
	}

	order := -1
	if ascending {
		order = 1
	}

	// typeID is the tiebreaker so that two item types with identical measures
	// keep a stable position across pages; without it the page boundary could
	// show or hide the same row twice.
	sort := bson.D{{Key: sortField, Value: order}, {Key: "_id", Value: 1}}

	stages := append(rangeMatchStages(q),
		bson.D{{Key: "$group", Value: sumMeasuresGroup("$typeID")}},
		bson.D{{Key: "$facet", Value: bson.M{
			"items": bson.A{
				bson.D{{Key: "$sort", Value: sort}},
				bson.D{{Key: "$skip", Value: offset}},
				bson.D{{Key: "$limit", Value: limit}},
				bson.D{{Key: "$addFields", Value: bson.M{"typeID": "$_id"}}},
			},
			"total": bson.A{bson.D{{Key: "$count", Value: "count"}}},
		}}},
	)

	var faceted []struct {
		Items []TimelineItemRow `bson:"items"`
		Total []struct {
			Count int `bson:"count"`
		} `bson:"total"`
	}
	if err := m.AccountTimelineMonths.Aggregate(ctx, mongo.Pipeline(stages), &faceted, append([]RetryOption{WithOpName("TimelineItems")}, opts...)...); err != nil {
		return page, err
	}
	if len(faceted) == 0 {
		return page, nil
	}

	page.Items = faceted[0].Items
	if len(faceted[0].Total) > 0 {
		page.TotalItems = faceted[0].Total[0].Count
	}
	return page, nil
}

// DefaultTimelineSort ranks the item breakdown when a caller names no measure.
// Exported so the handler can echo the ordering it actually applied instead of
// repeating the literal.
const DefaultTimelineSort = "profitLoss"

// timelineSortable is the set of measures the item breakdown may rank by.
//
// An allow-list rather than free choice: the value reaches a $sort key, and a
// caller-supplied field would let a request sort by anything in the document.
var timelineSortable = map[string]bool{
	"profitLoss":          true,
	"salesTotal":          true,
	"jobCostTotal":        true,
	"quantitySold":        true,
	"transactionCount":    true,
	"transactionFeeTotal": true,
	"brokersFeeTotal":     true,
}

// TimelineSortableMeasures lists the measures the item breakdown accepts, for
// the handler that validates the query parameter and reports the valid values.
//
// Sorted, because the list reaches an error message: map iteration order would
// make the same rejection read differently on each request.
func TimelineSortableMeasures() []string {
	out := make([]string, 0, len(timelineSortable))
	for measure := range timelineSortable {
		out = append(out, measure)
	}
	slices.Sort(out)
	return out
}

// TimelineSortable reports whether a measure may be used to rank the item
// breakdown, so a handler can reject a bad value before building a query.
func TimelineSortable(measure string) bool {
	return timelineSortable[measure]
}
