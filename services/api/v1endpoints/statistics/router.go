package statistics

import (
	"net/http"

	"eve-industry-planner/shared/shared"
)

// Router routes /api/v1/statistics/* (private mux: rate limit + JWT).
func Router(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	path := r.URL.Path
	switch path {
	case "/api/v1/statistics/build-stats", "/api/v1/statistics/build-stats/":
		GetBuildStatsHandler(w, r, clients)
	case "/api/v1/statistics/build-stats/timeline", "/api/v1/statistics/build-stats/timeline/":
		GetBuildStatsTimelineHandler(w, r, clients)
	case "/api/v1/statistics/build-stats/snapshots", "/api/v1/statistics/build-stats/snapshots/":
		GetBuildStatsSnapshotsHandler(w, r, clients)
	case "/api/v1/statistics/build-stats/rollup", "/api/v1/statistics/build-stats/rollup/":
		GetBuildStatsRollupHandler(w, r, clients)
	case "/api/v1/statistics/corp-build-stats", "/api/v1/statistics/corp-build-stats/":
		GetCorpBuildStatsHandler(w, r, clients)
	case "/api/v1/statistics/corp-build-stats/timeline", "/api/v1/statistics/corp-build-stats/timeline/":
		GetCorpBuildStatsTimelineHandler(w, r, clients)
	case "/api/v1/statistics/corp-build-stats/rollup", "/api/v1/statistics/corp-build-stats/rollup/":
		GetCorpBuildStatsRollupHandler(w, r, clients)
	default:
		http.Error(w, "Not found", http.StatusNotFound)
	}
}
