package docker

import "testing"

func TestRollupHealth(t *testing.T) {
	tests := []struct {
		name string
		in   []ServiceScore
		want HealthLight
	}{
		{name: "empty red", in: nil, want: HealthRed},
		{name: "all desired zero red", in: []ServiceScore{{Desired: 0, Running: 0}}, want: HealthRed},
		{
			name: "ignore desired zero",
			in: []ServiceScore{
				{Desired: 0, Running: 0},
				{Desired: 1, Running: 1},
			},
			want: HealthGreen,
		},
		{
			name: "running short amber",
			in:   []ServiceScore{{Desired: 2, Running: 1}},
			want: HealthAmber,
		},
		{
			name: "running zero red",
			in:   []ServiceScore{{Desired: 1, Running: 0}},
			want: HealthRed,
		},
		{
			name: "no healthcheck green",
			in:   []ServiceScore{{Desired: 1, Running: 1}},
			want: HealthGreen,
		},
		{
			name: "unhealthy red",
			in:   []ServiceScore{{Desired: 1, Running: 1, TaskHealths: []TaskHealth{TaskHealthUnhealthy}}},
			want: HealthRed,
		},
		{
			name: "starting amber",
			in:   []ServiceScore{{Desired: 1, Running: 1, TaskHealths: []TaskHealth{TaskHealthStarting}}},
			want: HealthAmber,
		},
		{
			name: "worst wins",
			in: []ServiceScore{
				{Desired: 1, Running: 1, TaskHealths: []TaskHealth{TaskHealthHealthy}},
				{Desired: 2, Running: 1},
			},
			want: HealthAmber,
		},
		{
			name: "failed desired red",
			in:   []ServiceScore{{Desired: 1, Running: 1, HasFailedDesired: true}},
			want: HealthRed,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := RollupHealth(tt.in); got != tt.want {
				t.Fatalf("RollupHealth=%v want %v", got, tt.want)
			}
		})
	}
}

func TestHealthSummaryNoStackIsOff(t *testing.T) {
	t.Parallel()
	light, detail := (StackSnapshot{}).HealthSummary()
	if light != HealthOff {
		t.Fatalf("light=%v want off", light)
	}
	if detail != "no stack services" {
		t.Fatalf("detail=%q", detail)
	}
}
