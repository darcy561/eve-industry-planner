package statistics

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"eve-industry-planner/shared/shared/models"
)

func ym(y, m int) int { return y*12 + m }

type rollupWindow struct {
	meta models.BuildStatsRollupPeriodMeta
}

func (w rollupWindow) contains(year, month int) bool {
	if month < 1 || month > 12 {
		return false
	}
	switch w.meta.Kind {
	case "month":
		return year == w.meta.Year && month == w.meta.Month
	case "year":
		return year == w.meta.Year
	case "range":
		v := ym(year, month)
		return v >= ym(w.meta.FromYear, w.meta.FromMonth) && v <= ym(w.meta.ToYear, w.meta.ToMonth)
	case "years":
		for _, y := range w.meta.Years {
			if year == y {
				return true
			}
		}
		return false
	default:
		return false
	}
}

// parseRollupWindow reads period query parameters. Priority: years → range (from/to) → month (year+month) → year-only.
//
//   - years: comma-separated calendar years, e.g. years=2023,2024 (all months in each listed year).
//   - fromYear, fromMonth, toYear, toMonth: inclusive month range (all four required).
//   - year, month: single calendar month (both required).
//   - year: alone — all twelve months of that year.
func parseRollupWindow(r *http.Request) (rollupWindow, error) {
	q := r.URL.Query()
	var w rollupWindow

	yearsStr := strings.TrimSpace(q.Get("years"))
	if yearsStr != "" {
		parts := strings.Split(yearsStr, ",")
		seen := make(map[int]struct{})
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}
			y, err := strconv.Atoi(p)
			if err != nil || y < 1 || y > 9999 {
				return w, fmt.Errorf("invalid years parameter")
			}
			seen[y] = struct{}{}
		}
		if len(seen) == 0 {
			return w, fmt.Errorf("invalid years parameter")
		}
		list := make([]int, 0, len(seen))
		for y := range seen {
			list = append(list, y)
		}
		sort.Ints(list)
		w.meta.Kind = "years"
		w.meta.Years = list
		return w, nil
	}

	fromYStr, fromMStr := strings.TrimSpace(q.Get("fromYear")), strings.TrimSpace(q.Get("fromMonth"))
	toYStr, toMStr := strings.TrimSpace(q.Get("toYear")), strings.TrimSpace(q.Get("toMonth"))
	if fromYStr != "" || fromMStr != "" || toYStr != "" || toMStr != "" {
		if fromYStr == "" || fromMStr == "" || toYStr == "" || toMStr == "" {
			return w, fmt.Errorf("fromYear, fromMonth, toYear, and toMonth are all required together")
		}
		fy, err1 := strconv.Atoi(fromYStr)
		fm, err2 := strconv.Atoi(fromMStr)
		ty, err3 := strconv.Atoi(toYStr)
		tm, err4 := strconv.Atoi(toMStr)
		if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
			return w, fmt.Errorf("invalid from/to year or month")
		}
		if fm < 1 || fm > 12 || tm < 1 || tm > 12 || fy < 1 || fy > 9999 || ty < 1 || ty > 9999 {
			return w, fmt.Errorf("invalid from/to year or month")
		}
		if ym(fy, fm) > ym(ty, tm) {
			return w, fmt.Errorf("period range is empty (from after to)")
		}
		w.meta.Kind = "range"
		w.meta.FromYear, w.meta.FromMonth = fy, fm
		w.meta.ToYear, w.meta.ToMonth = ty, tm
		return w, nil
	}

	yearStr := strings.TrimSpace(q.Get("year"))
	monthStr := strings.TrimSpace(q.Get("month"))
	if yearStr == "" {
		return w, fmt.Errorf("missing period: use years=…, or fromYear/fromMonth/toYear/toMonth, or year with optional month")
	}
	y, err := strconv.Atoi(yearStr)
	if err != nil || y < 1 || y > 9999 {
		return w, fmt.Errorf("invalid year")
	}
	if monthStr != "" {
		m, err := strconv.Atoi(monthStr)
		if err != nil || m < 1 || m > 12 {
			return w, fmt.Errorf("invalid month")
		}
		w.meta.Kind = "month"
		w.meta.Year, w.meta.Month = y, m
		return w, nil
	}
	w.meta.Kind = "year"
	w.meta.Year = y
	return w, nil
}

func parseOptionalTypeID(q string) (*int, error) {
	s := strings.TrimSpace(q)
	if s == "" {
		return nil, nil
	}
	v, err := strconv.ParseInt(s, 10, 32)
	if err != nil || v < 0 {
		return nil, fmt.Errorf("invalid typeID")
	}
	t := int(v)
	return &t, nil
}
