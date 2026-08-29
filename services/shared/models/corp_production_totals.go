package models

// CorpProductionTotalsRow is one corporation production total, keyed by corporation ref and item type.
type CorpProductionTotalsRow struct {
	ID            string `bson:"_id" json:"-"`
	CorpRef       string `bson:"corpRef" json:"corpRef"`
	TypeID        int    `bson:"typeID" json:"typeID"`
	BuildMeasures `bson:",inline"`
	Breakdown     ProductionTotalsBreakdown `bson:"breakdown" json:"breakdown"`
}

// Plus sums src into r.
func (r CorpProductionTotalsRow) Plus(src CorpProductionTotalsRow) CorpProductionTotalsRow {
	r.BuildMeasures = r.BuildMeasures.Plus(src.BuildMeasures)
	r.Breakdown = r.Breakdown.Plus(src.Breakdown)
	return r
}
