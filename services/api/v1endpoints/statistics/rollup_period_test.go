package statistics

import (
	"net/http/httptest"
	"testing"
)

func TestParseRollupWindow_Month(t *testing.T) {
	r := httptest.NewRequest("GET", "/?year=2024&month=3", nil)
	w, err := parseRollupWindow(r)
	if err != nil {
		t.Fatal(err)
	}
	if w.meta.Kind != "month" || w.meta.Year != 2024 || w.meta.Month != 3 {
		t.Fatalf("meta=%+v", w.meta)
	}
	if !w.contains(2024, 3) || w.contains(2024, 4) || w.contains(2023, 3) {
		t.Fatal("contains wrong")
	}
}

func TestParseRollupWindow_Year(t *testing.T) {
	r := httptest.NewRequest("GET", "/?year=2025", nil)
	w, err := parseRollupWindow(r)
	if err != nil {
		t.Fatal(err)
	}
	if w.meta.Kind != "year" || w.meta.Year != 2025 {
		t.Fatalf("meta=%+v", w.meta)
	}
	if !w.contains(2025, 1) || !w.contains(2025, 12) || w.contains(2024, 12) {
		t.Fatal("contains wrong")
	}
}

func TestParseRollupWindow_Range(t *testing.T) {
	r := httptest.NewRequest("GET", "/?fromYear=2024&fromMonth=11&toYear=2025&toMonth=2", nil)
	w, err := parseRollupWindow(r)
	if err != nil {
		t.Fatal(err)
	}
	if w.meta.Kind != "range" {
		t.Fatalf("meta=%+v", w.meta)
	}
	if !w.contains(2024, 11) || !w.contains(2025, 1) || !w.contains(2025, 2) {
		t.Fatal("should include boundary months")
	}
	if w.contains(2024, 10) || w.contains(2025, 3) {
		t.Fatal("should exclude outside range")
	}
}

func TestParseRollupWindow_Years(t *testing.T) {
	r := httptest.NewRequest("GET", "/?years=2024,2022,2024", nil)
	w, err := parseRollupWindow(r)
	if err != nil {
		t.Fatal(err)
	}
	if w.meta.Kind != "years" || len(w.meta.Years) != 2 || w.meta.Years[0] != 2022 || w.meta.Years[1] != 2024 {
		t.Fatalf("meta=%+v", w.meta)
	}
	if !w.contains(2022, 6) || !w.contains(2024, 1) || w.contains(2023, 6) {
		t.Fatal("contains wrong")
	}
}

func TestParseRollupWindow_Errors(t *testing.T) {
	for _, path := range []string{
		"/",
		"/?year=abc",
		"/?year=2024&month=13",
		"/?fromYear=2025&fromMonth=1&toYear=2024&toMonth=12",
		"/?fromYear=2025&fromMonth=1&toYear=2025",
	} {
		r := httptest.NewRequest("GET", path, nil)
		if _, err := parseRollupWindow(r); err == nil {
			t.Fatalf("expected error for %q", path)
		}
	}
}
