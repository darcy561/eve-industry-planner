package archivestats

import (
	"testing"

	"eve-industry-planner/shared/models"
)

func TestMonthsInRollupPeriod(t *testing.T) {
	got, err := MonthsInRollupPeriod(models.BuildStatsRollupPeriodMeta{Kind: "month", Year: 2024, Month: 3})
	if err != nil || len(got) != 1 || got[0].Year != 2024 || got[0].Month != 3 {
		t.Fatalf("month: %+v err=%v", got, err)
	}
	got, err = MonthsInRollupPeriod(models.BuildStatsRollupPeriodMeta{Kind: "year", Year: 2025})
	if err != nil || len(got) != 12 || got[11].Month != 12 {
		t.Fatalf("year: len=%d %+v err=%v", len(got), got, err)
	}
	got, err = MonthsInRollupPeriod(models.BuildStatsRollupPeriodMeta{Kind: "range", FromYear: 2024, FromMonth: 11, ToYear: 2025, ToMonth: 2})
	if err != nil || len(got) != 4 || got[0].Month != 11 || got[3].Month != 2 {
		t.Fatalf("range: %+v err=%v", got, err)
	}
	got, err = MonthsInRollupPeriod(models.BuildStatsRollupPeriodMeta{Kind: "years", Years: []int{2022, 2024}})
	if err != nil || len(got) != 24 || got[0].Year != 2022 || got[11].Month != 12 {
		t.Fatalf("years: %+v err=%v", got, err)
	}
}
