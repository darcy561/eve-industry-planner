package models

import (
	"encoding/json"
	"testing"
)

func TestFlexibleStringUnmarshalJSON(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{`"misc"`, "misc"},
		{`42`, "42"},
		{`3.5`, "3.5"},
		{`true`, "true"},
		{`null`, ""},
	}
	for _, tt := range tests {
		var f FlexibleString
		if err := json.Unmarshal([]byte(tt.raw), &f); err != nil {
			t.Fatalf("Unmarshal(%s): %v", tt.raw, err)
		}
		if f.String() != tt.want {
			t.Fatalf("Unmarshal(%s): got %q want %q", tt.raw, f, tt.want)
		}
	}
}

func TestFlexibleInt64UnmarshalJSON(t *testing.T) {
	tests := []struct {
		raw  string
		want int64
	}{
		{`6412345678`, 6412345678},
		{`"6412345678"`, 6412345678},
		{`6.412345678e9`, 6412345678},
		{`null`, 0},
		{`""`, 0},
		{`"639b647c-0c1c-9c4a-987e-5d95b5ec7735"`, 0},
	}
	for _, tt := range tests {
		var f FlexibleInt64
		if err := json.Unmarshal([]byte(tt.raw), &f); err != nil {
			t.Fatalf("Unmarshal(%s): %v", tt.raw, err)
		}
		if f.Int64() != tt.want {
			t.Fatalf("Unmarshal(%s): got %d want %d", tt.raw, f, tt.want)
		}
	}
}

func TestFlexibleRoundedIntUnmarshalJSON(t *testing.T) {
	tests := []struct {
		raw  string
		want int
	}{
		{`8`, 8},
		{`7.999979999999999`, 8},
		{`"42"`, 42},
		{`"7.6"`, 8},
		{`null`, 0},
		{`""`, 0},
	}
	for _, tt := range tests {
		var f FlexibleRoundedInt
		if err := json.Unmarshal([]byte(tt.raw), &f); err != nil {
			t.Fatalf("Unmarshal(%s): %v", tt.raw, err)
		}
		if f.Int() != tt.want {
			t.Fatalf("Unmarshal(%s): got %d want %d", tt.raw, f, tt.want)
		}
	}
}

func TestFlexibleFloat64UnmarshalJSON(t *testing.T) {
	tests := []struct {
		raw  string
		want float64
	}{
		{`12.5`, 12.5},
		{`"12.5"`, 12.5},
		{`"1e2"`, 100},
		{`0`, 0},
		{`null`, 0},
		{`""`, 0},
		{`"not-a-number"`, 0},
	}
	for _, tt := range tests {
		var f FlexibleFloat64
		if err := json.Unmarshal([]byte(tt.raw), &f); err != nil {
			t.Fatalf("Unmarshal(%s): %v", tt.raw, err)
		}
		if f.Float64() != tt.want {
			t.Fatalf("Unmarshal(%s): got %g want %g", tt.raw, f, tt.want)
		}
	}
}
