package deploy

import (
	"strings"

	"eve-industry-planner/admintool/internal/docker"
)

// Source is how a service (or the stack overall) was deployed (eip.deploy.source).
type Source string

const (
	SourceLive    Source = "live"
	SourceDev     Source = "dev"
	SourceMixed   Source = "mixed"   // both live and dev on the stack
	SourceUnknown Source = "unknown" // no eip.deploy.source label
)

func serviceSource(svc docker.ServiceInfo) Source {
	v := strings.TrimSpace(svc.Labels[LabelDeploySource])
	switch Source(strings.ToLower(v)) {
	case SourceLive:
		return SourceLive
	case SourceDev:
		return SourceDev
	default:
		return SourceUnknown
	}
}

// ResolveSource aggregates per-service eip.deploy.source labels.
func ResolveSource(snap docker.StackSnapshot) Source {
	if !snap.Present {
		return SourceUnknown
	}
	var live, dev bool
	for _, svc := range snap.Services {
		switch serviceSource(svc) {
		case SourceLive:
			live = true
		case SourceDev:
			dev = true
		}
	}
	switch {
	case live && dev:
		return SourceMixed
	case live:
		return SourceLive
	case dev:
		return SourceDev
	default:
		return SourceUnknown
	}
}

// SourceDetail is a short human phrase for status / logs.
func SourceDetail(src Source) string {
	switch src {
	case SourceLive:
		return "eip.deploy.source=live"
	case SourceDev:
		return "eip.deploy.source=dev"
	case SourceMixed:
		return "mixed live and dev services"
	default:
		return "no eip.deploy.source label"
	}
}
