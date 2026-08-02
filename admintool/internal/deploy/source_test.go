package deploy

import (
	"testing"

	"eve-industry-planner/admintool/internal/docker"
)

func TestResolveSource(t *testing.T) {
	tests := []struct {
		name string
		snap docker.StackSnapshot
		want Source
	}{
		{
			name: "absent stack",
			snap: docker.StackSnapshot{},
			want: SourceUnknown,
		},
		{
			name: "unlabeled",
			snap: docker.StackSnapshot{
				Present:  true,
				Services: map[string]docker.ServiceInfo{"api": {Image: "ghcr.io/example/api:1"}},
			},
			want: SourceUnknown,
		},
		{
			name: "live",
			snap: docker.StackSnapshot{
				Present: true,
				Services: map[string]docker.ServiceInfo{
					"api": {Labels: map[string]string{LabelDeploySource: "live"}},
				},
			},
			want: SourceLive,
		},
		{
			name: "dev",
			snap: docker.StackSnapshot{
				Present: true,
				Services: map[string]docker.ServiceInfo{
					"api": {Labels: map[string]string{LabelDeploySource: "dev"}},
				},
			},
			want: SourceDev,
		},
		{
			name: "mixed",
			snap: docker.StackSnapshot{
				Present: true,
				Services: map[string]docker.ServiceInfo{
					"api":      {Labels: map[string]string{LabelDeploySource: "live"}},
					"frontend": {Labels: map[string]string{LabelDeploySource: "dev"}},
				},
			},
			want: SourceMixed,
		},
		{
			name: "junk label",
			snap: docker.StackSnapshot{
				Present: true,
				Services: map[string]docker.ServiceInfo{
					"api": {Labels: map[string]string{LabelDeploySource: "bake"}},
				},
			},
			want: SourceUnknown,
		},
	}
	for _, tt := range tests {
		if got := ResolveSource(tt.snap); got != tt.want {
			t.Fatalf("%s: got %s want %s", tt.name, got, tt.want)
		}
	}
}

