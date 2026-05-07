package archivestats

import (
	"fmt"
	"sort"

	"eve-industry-planner/shared/shared/models"
)

// YearMonth is a calendar month.
type YearMonth struct {
	Year  int
	Month int
}

func ym(y, m int) int { return y*12 + m }

// MonthsInRollupPeriod enumerates every (year, month) included in PeriodMeta (same semantics as rollup API).
func MonthsInRollupPeriod(meta models.BuildStatsRollupPeriodMeta) ([]YearMonth, error) {
	switch meta.Kind {
	case "month":
		return []YearMonth{{Year: meta.Year, Month: meta.Month}}, nil
	case "year":
		out := make([]YearMonth, 0, 12)
		for m := 1; m <= 12; m++ {
			out = append(out, YearMonth{Year: meta.Year, Month: m})
		}
		return out, nil
	case "range":
		if ym(meta.FromYear, meta.FromMonth) > ym(meta.ToYear, meta.ToMonth) {
			return nil, fmt.Errorf("invalid range")
		}
		var out []YearMonth
		for y, m := meta.FromYear, meta.FromMonth; ; {
			out = append(out, YearMonth{Year: y, Month: m})
			if y == meta.ToYear && m == meta.ToMonth {
				break
			}
			m++
			if m > 12 {
				m = 1
				y++
			}
		}
		return out, nil
	case "years":
		years := append([]int(nil), meta.Years...)
		sort.Ints(years)
		var out []YearMonth
		for _, y := range years {
			for m := 1; m <= 12; m++ {
				out = append(out, YearMonth{Year: y, Month: m})
			}
		}
		return out, nil
	default:
		return nil, fmt.Errorf("unknown period kind %q", meta.Kind)
	}
}
