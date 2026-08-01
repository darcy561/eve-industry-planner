package config

import "strings"

// GrafanaRootURL builds GRAFANA_ROOT_URL for SyncEnvMap expand
// (http://127.0.0.1{path}/). Swarm apply uses stack.DesiredGrafanaRootURL.
func GrafanaRootURL(pathPrefix string) string {
	pathPrefix = strings.TrimSpace(pathPrefix)
	if pathPrefix == "" {
		pathPrefix = "/grafana"
	}
	return "http://127.0.0.1" + pathPrefix + "/"
}
