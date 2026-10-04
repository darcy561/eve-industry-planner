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
	return models.CalendarMonth{Year: m.Year, Month: m.Month}.String()
}

// ParseMonthKey reads the wire form, YYYY-MM.
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
	Owner                  models.Owner
	From                   MonthKey
	To                     MonthKey
	TypeID                 int
	IncludeProductionChain bool
	AllTime                bool
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
	ExtraCategoryLabels []map[string]string  `bson:"extraCategoryLabelsList"`
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
	for _, labels := range r.ExtraCategoryLabels {
		if len(labels) == 0 {
			continue
		}
		row.SalesMeasures = row.SalesMeasures.Plus(models.SalesMeasures{ExtraCategoryLabels: labels})
	}
	return row
}

// TimelineItemRow is one item type's share of the whole window.
type TimelineItemRow struct {
	TypeID               int `bson:"typeID"`
	models.SalesMeasures `bson:",inline"`
}

// timelineRangeFilter scopes bucket rows to an account and an inclusive month range.
func timelineRangeFilter(q TimelineQuery) bson.M {
	filter := OwnerFilter(q.Owner)
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

// summableMeasureFields names every numeric measure on SalesMeasures, read from the struct so a
// measure added to the document cannot be left out of the aggregation.
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
func sumMeasuresGroup(id any) bson.M {
	group := bson.M{"_id": id}
	for _, field := range summableMeasureFields() {
		group[field] = bson.M{"$sum": "$" + field}
	}
	return group
}

// The collected maps, named in a group that asks for them.
const (
	extraCategoryTotalsField = "extraCategoryTotalsList"
	extraCategoryLabelsField = "extraCategoryLabelsList"
)

// extraCategoryTotalsPush adds the per-category maps to a group stage.
func extraCategoryTotalsPush(group bson.M) bson.M {
	group[extraCategoryTotalsField] = bson.M{"$push": "$extraCategoryTotals"}
	group[extraCategoryLabelsField] = bson.M{"$push": "$extraCategoryLabels"}
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

// TimelineMonths sums an owner's bucket rows into one entry per calendar month, ascending.
func (m *Mongo) TimelineMonths(ctx context.Context, q TimelineQuery, opts ...RetryOption) ([]TimelineMonthRow, error) {
	if m == nil || m.StatisticsTimeline == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	if err := q.Owner.Validate(); err != nil {
		return nil, err
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
	if err := m.StatisticsTimeline.Aggregate(ctx, pipeline, &rows, append([]RetryOption{WithOpName("TimelineMonths")}, opts...)...); err != nil {
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

// TimelineItems groups an owner's bucket rows by item type across the whole window, ranked.
func (m *Mongo) TimelineItems(ctx context.Context, q TimelineQuery, sortField string, ascending bool, limit, offset int, opts ...RetryOption) (TimelineItemsPage, error) {
	var page TimelineItemsPage
	if m == nil || m.StatisticsTimeline == nil {
		return page, fmt.Errorf("mongo handle is required")
	}
	if err := q.Owner.Validate(); err != nil {
		return page, err
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
	if err := m.StatisticsTimeline.Aggregate(ctx, mongo.Pipeline(stages), &faceted, append([]RetryOption{WithOpName("TimelineItems")}, opts...)...); err != nil {
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
const DefaultTimelineSort = "profitLoss"

// timelineSortable is the set of measures the item breakdown may rank by.
var timelineSortable = map[string]bool{
	"profitLoss":          true,
	"salesTotal":          true,
	"jobCostTotal":        true,
	"quantitySold":        true,
	"transactionCount":    true,
	"transactionFeeTotal": true,
	"brokersFeeTotal":     true,
}

// TimelineSortableMeasures lists the measures the item breakdown accepts, for the handler that
// validates the query parameter and reports the valid values.
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
