package models

// CorpBuildStatsRow is one document in MongoDB corp_build_stats, keyed by corporation ref and item type.
type CorpBuildStatsRow struct {
	ID            string `bson:"_id" json:"-"`
	CorpRef       string `bson:"corpRef" json:"corpRef"`
	TypeID        int    `bson:"typeID" json:"typeID"`
	BuildMeasures `bson:",inline"`
	Breakdown     BuildStatsBreakdown `bson:"breakdown" json:"breakdown"`
}

// Plus sums src into r.
func (r CorpBuildStatsRow) Plus(src CorpBuildStatsRow) CorpBuildStatsRow {
	r.BuildMeasures = r.BuildMeasures.Plus(src.BuildMeasures)
	r.Breakdown = r.Breakdown.Plus(src.Breakdown)
	return r
}

// CorpBuildStatsTimelineBucket is one calendar month of a corporation's sales for an item type.
type CorpBuildStatsTimelineBucket struct {
	ID            string `bson:"_id" json:"-"`
	CorpRef       string `bson:"corpRef" json:"corpRef"`
	TypeID        int    `bson:"typeID" json:"typeID"`
	CalendarMonth `bson:",inline"`
	SalesMeasures `bson:",inline"`
}
