// Expected Swarm services and deploy fragments (status / deploy membership).
package catalog

// Fragment IDs used by status and deploy membership.
const (
	FragmentApp  = "app"
	FragmentData = "data"
	FragmentObs  = "obs"
)

// Fragment describes one deployable unit (app / data / obs).
type Fragment struct {
	ID       string
	Title    string
	Optional bool // omit from status groups when nothing from this fragment is on stack
}

// Fragments returns fragment metadata in report / membership order.
func Fragments() []Fragment {
	return []Fragment{
		{ID: FragmentApp, Title: "App"},
		{ID: FragmentData, Title: "Data"},
		{ID: FragmentObs, Title: "Observability", Optional: true},
	}
}

// Service is one expected stack member (short Swarm name without stack prefix).
type Service struct {
	Short string // e.g. "api"
	Label string // operator-facing row label
}

// Group is a named set of expected services.
type Group struct {
	Title    string
	Fragment string // FragmentApp | FragmentData | FragmentObs
	Critical bool   // false = observability / ops-only (OK* overall)
	Services []Service
}

// RestartPrefer is the preferred short-name order for whole-stack rolling restart.
// Live services not listed here are restarted after these (stable short-name order).
func RestartPrefer() []string {
	return []string{
		"traefik", "api", "websocket", "worker", "ws-router", "core", "frontend",
		"mongo", "redis", "nats", "seaweedfs", "prometheus",
	}
}

// Groups returns expected inventory in report order.
func Groups() []Group {
	return []Group{
		{
			Title:    "App",
			Fragment: FragmentApp,
			Critical: true,
			Services: []Service{
				{Short: "traefik", Label: "Traefik"},
				{Short: "frontend", Label: "Website"},
				{Short: "api", Label: "API"},
				{Short: "websocket", Label: "Websocket"},
				{Short: "ws-router", Label: "Websocket router"},
				{Short: "worker", Label: "Background worker"},
				{Short: "core", Label: "Core"},
				{Short: "traefik-docker-proxy", Label: "Traefik helper"},
				{Short: "ws-docker-proxy", Label: "Websocket helper"},
			},
		},
		{
			Title:    "Data layer",
			Fragment: FragmentData,
			Critical: true,
			Services: []Service{
				{Short: "mongo", Label: "Database"},
				{Short: "redis", Label: "Cache"},
				{Short: "nats", Label: "Messaging"},
				{Short: "seaweedfs", Label: "Object store"},
				{Short: "prometheus", Label: "Prometheus"},
			},
		},
		{
			Title:    "Observability",
			Fragment: FragmentObs,
			Critical: false,
			Services: []Service{
				{Short: "grafana", Label: "Grafana"},
				{Short: "loki", Label: "Loki"},
				{Short: "alloy", Label: "Alloy"},
				{Short: "alloy-docker-proxy", Label: "Alloy helper"},
				{Short: "asynqmon", Label: "Job monitor"},
				{Short: "nats-exporter", Label: "NATS exporter"},
				{Short: "redis-exporter", Label: "Redis exporter"},
				{Short: "mongodb-exporter", Label: "Mongo exporter"},
				{Short: "node_exporter", Label: "Node exporter"},
			},
		},
	}
}
