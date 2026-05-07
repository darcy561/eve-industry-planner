package moneyutil

import "testing"

func TestRound2(t *testing.T) {
	tests := []struct {
		name string
		in   float64
		want float64
	}{
		{name: "whole number", in: 10, want: 10},
		{name: "round down", in: 10.124, want: 10.12},
		{name: "round up", in: 10.125, want: 10.13},
		{name: "small epsilon edge", in: 1.005, want: 1.01},
		{name: "negative value", in: -1.235, want: -1.23},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Round2(tt.in)
			if got != tt.want {
				t.Fatalf("Round2(%v) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}
