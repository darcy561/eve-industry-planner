// Package staticdata serves public /api/static-data/* endpoints.
package staticdata

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/sdecache"
	objectstore "eve-industry-planner/shared/core/objectstore"
	sdecore "eve-industry-planner/shared/core/sde"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

type staticDataMeta struct {
	BuildVersion string              `json:"build_version"`
	BuildNumber  int                 `json:"build_number"`
	FileKeys     map[string]fileMeta `json:"file_keys"`
}

type fileMeta struct {
	Path         string    `json:"path"`
	URL          string    `json:"url"`
	VersionedURL string    `json:"versioned_url"`
	Exists       bool      `json:"exists"`
	Size         int64     `json:"size"`
	ModTime      time.Time `json:"mod_time,omitempty"`
}

// FileRoutes returns one handler per published static data file, keyed by the
// path it is served at.
//
// Built from the SDE file definitions rather than listed here, so a file added
// there is served without a second edit. A file the server publishes but does
// not route is worse than one it does not publish at all: the meta endpoint
// advertises it from the same definitions, so every client would ask for it and
// take a 404.
func FileRoutes() map[string]http.HandlerFunc {
	m := apimetrics.GetAPIStaticData()
	routes := make(map[string]http.HandlerFunc, len(sdecore.OutputFileNames()))
	for _, name := range sdecore.OutputFileNames() {
		fileName := name
		metricName := staticDataMetricName(fileName)
		routes["/api/static-data/"+fileName] = func(w http.ResponseWriter, r *http.Request) {
			serveStaticDataFile(w, r, fileName, m.File(metricName), metricName)
		}
	}
	return routes
}

// staticDataMetricName turns a file name into the snake_case name its metrics
// and error labels carry: "fullItemList.json" becomes "full_item_list".
func staticDataMetricName(fileName string) string {
	base, _ := strings.CutSuffix(fileName, ".json")
	var out strings.Builder
	for i, r := range base {
		if unicode.IsUpper(r) {
			if i > 0 {
				out.WriteByte('_')
			}
			out.WriteRune(unicode.ToLower(r))
			continue
		}
		out.WriteRune(r)
	}
	return out.String()
}

func MetaHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIStaticData()

	if r.Method != http.MethodGet {
		m.Errors.WithLabelValues("meta_method_not_allowed").Inc(ctx)
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for static data meta endpoint", "static_data_meta_method_not_allowed", "static_data", nil, map[string]any{"method": r.Method})
		return
	}

	// This is how a client learns a new build exists, so it is never served from
	// a cache: held for ten minutes it capped how fast anything could notice one,
	// and a browser answered its own reload from that copy. The files it names
	// stay immutable — they carry the build in their URL and never change under
	// it, which is what makes this one safe to ask for every time.
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("CDN-Cache-Control", "no-cache")
	w.Header().Set("Cloudflare-CDN-Cache-Control", "no-cache")
	w.Header().Set("Vary", "Accept-Encoding")

	backend, err := sdecache.OpenBackend(ctx)
	if err != nil {
		helper.RespondEndpointServerError(w, r, "static data store unavailable", "static data store error", "static_data_store_unavailable", "static_data", err, nil)
		return
	}
	version, _ := sdecore.ReadRootVersionJSON(ctx, backend)

	files := sdecore.OutputFileNames()
	filesByKey := sdecore.OutputFilesByKey()
	meta := staticDataMeta{
		FileKeys: make(map[string]fileMeta, len(filesByKey)),
	}
	if version != nil {
		meta.BuildVersion = version.Version
		meta.BuildNumber = version.BuildNumber
	}

	for _, name := range files {
		key := sdecore.LiveKey(name)
		fm := fileMeta{
			Path:         key,
			URL:          "/api/static-data/" + name,
			VersionedURL: "/api/static-data/" + name,
			Exists:       false,
		}
		if info, err := backend.Stat(ctx, key); err == nil {
			fm.Exists = true
			fm.Size = info.Size
			fm.ModTime = info.ModTime
		}
		if meta.BuildVersion != "" {
			fm.VersionedURL = fm.URL + "?v=" + meta.BuildVersion
		} else if meta.BuildNumber > 0 {
			fm.VersionedURL = fm.URL + "?v=" + strconv.Itoa(meta.BuildNumber)
		}
		for fileKey, fileName := range filesByKey {
			if fileName == name {
				meta.FileKeys[fileKey] = fm
				break
			}
		}
	}

	detail := staticDataFileServeDetail(r, "", "meta", 0)
	detail["build_version"] = meta.BuildVersion
	detail["build_number"] = meta.BuildNumber
	detail["file_count"] = len(meta.FileKeys)
	detail["backend"] = backend.Kind()

	logs.AttachDebugStep(r, "static_data_meta_built", detail)

	if err := helper.EncodeJSON(w, meta); err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("meta_encode_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "static_data_meta", duration, "encode_error", "error", err)
		helper.RespondEndpointServerError(w, r, fmt.Sprintf("failed to encode response: %v", err), "static data meta encode error", "static_data_meta_encode_failed", "static_data", err, nil)
		return
	}

	duration := time.Since(start)
	m.Meta.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.Meta.RequestsCount.Inc(ctx)
	if duration > time.Second {
		apimetrics.LogRequestMetrics(ctx, "static_data_meta", duration, "success")
	}
	logs.AttachHandlerSuccessDetail(r, "static data meta served", map[string]any{
		"url_path":      r.URL.Path,
		"build_version": meta.BuildVersion,
		"build_number":  meta.BuildNumber,
		"file_count":    len(meta.FileKeys),
		"duration_ms":   duration.Milliseconds(),
	})
}

func serveStaticDataFile(w http.ResponseWriter, r *http.Request, fileName string, fileMetrics *apimetrics.StaticDataFileMetrics, errPrefix string) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	shared := apimetrics.GetAPIStaticData()

	if r.Method != http.MethodGet {
		shared.Errors.WithLabelValues(errPrefix + "_method_not_allowed").Inc(ctx)
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for static data file", "static_data_file_method_not_allowed", "static_data", nil, map[string]any{"method": r.Method, "file": errPrefix})
		return
	}

	objectKey := sdecore.LiveKey(fileName)
	data, err := sdecache.ReadLiveFile(ctx, fileName)
	if err != nil {
		duration := time.Since(start)
		if errors.Is(err, objectstore.ErrNotFound) {
			shared.Errors.WithLabelValues(errPrefix + "_not_found").Inc(ctx)
			helper.RespondEndpointError(w, r, http.StatusNotFound, "static data file not found", "static data file not found", "static_data_file_not_found", "static_data", err, map[string]any{"file": errPrefix, "object_key": objectKey})
			return
		}
		shared.Errors.WithLabelValues(errPrefix + "_read_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "static_data_"+errPrefix, duration, "read_error",
			"error", err, "object_key", objectKey)
		helper.RespondEndpointServerError(w, r, "failed to read static data file", "static data read error", "static_data_read_failed", "static_data", err, map[string]any{"file": errPrefix, "object_key": objectKey})
		return
	}

	var raw json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		duration := time.Since(start)
		shared.Errors.WithLabelValues(errPrefix + "_invalid_json").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "static_data_"+errPrefix, duration, "invalid_json",
			"error", err, "object_key", objectKey)
		helper.RespondEndpointServerError(w, r, "static data file is invalid JSON", "static data invalid json", "static_data_invalid_json", "static_data", err, map[string]any{"file": errPrefix, "object_key": objectKey})
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=2592000, immutable")
	w.Header().Set("CDN-Cache-Control", "public, s-maxage=2592000, immutable")
	w.Header().Set("Cloudflare-CDN-Cache-Control", "public, s-maxage=2592000, immutable")
	w.Header().Set("Vary", "Accept-Encoding")

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)

	serveDetail := staticDataFileServeDetail(r, fileName, errPrefix, len(data))
	logs.AttachDebugStep(r, "static_data_file_served", serveDetail)

	duration := time.Since(start)
	fileMetrics.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	fileMetrics.RequestsCount.Inc(ctx)
	if duration > time.Second {
		apimetrics.LogRequestMetrics(ctx, "static_data_"+errPrefix, duration, "success")
	}
	serveDetail["duration_ms"] = duration.Milliseconds()
	logs.AttachHandlerSuccessDetail(r, fmt.Sprintf("static data file served (%s)", fileName), serveDetail)
}

func staticDataFileServeDetail(r *http.Request, fileName, fileKey string, bytes int) map[string]any {
	detail := map[string]any{
		"file_name": fileName,
		"file_key":  fileKey,
		"bytes":     bytes,
	}
	if r != nil {
		detail["url_path"] = r.URL.Path
		if v := r.URL.Query().Get("v"); v != "" {
			detail["query_version"] = v
		}
	}
	return detail
}
