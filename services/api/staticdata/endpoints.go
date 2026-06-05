package staticdata

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	"eve-industry-planner/api/helper"
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

func RecipeListHandler(w http.ResponseWriter, r *http.Request) {
	m := apimetrics.GetAPIStaticData()
	serveStaticDataFile(w, r, sdecore.RecipeListFile, m.RecipeList, "recipe_list")
}

func SearchIndexHandler(w http.ResponseWriter, r *http.Request) {
	m := apimetrics.GetAPIStaticData()
	serveStaticDataFile(w, r, sdecore.SearchIndexFile, m.SearchIndex, "search_index")
}

func FullItemListHandler(w http.ResponseWriter, r *http.Request) {
	m := apimetrics.GetAPIStaticData()
	serveStaticDataFile(w, r, sdecore.FullItemListFile, m.FullItemList, "full_item_list")
}

func ReprocessingDataHandler(w http.ResponseWriter, r *http.Request) {
	m := apimetrics.GetAPIStaticData()
	serveStaticDataFile(w, r, sdecore.ReprocessingFile, m.Reprocessing, "reprocessing")
}

func InventionModifiersHandler(w http.ResponseWriter, r *http.Request) {
	m := apimetrics.GetAPIStaticData()
	serveStaticDataFile(w, r, sdecore.InventionModifiersFile, m.InventionModifiers, "invention_modifiers")
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
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for static data meta endpoint", "static_data_meta_method_not_allowed", "static_data", nil, map[string]interface{}{"method": r.Method})
		return
	}

	// Cache metadata for 10 minutes at browser + CDN/Cloudflare edge.
	w.Header().Set("Cache-Control", "public, max-age=600, stale-while-revalidate=60")
	w.Header().Set("CDN-Cache-Control", "public, s-maxage=600, stale-while-revalidate=60")
	w.Header().Set("Cloudflare-CDN-Cache-Control", "public, s-maxage=600, stale-while-revalidate=60")
	w.Header().Set("Vary", "Accept-Encoding")

	dataDir := os.Getenv("SDE_DATA_DIR")
	if dataDir == "" {
		dataDir = sdecore.ResolveDataDir()
	}
	version, _ := sdecore.ReadVersionJSON(dataDir)

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
		p := sdecore.LiveDataFilePath(dataDir, name)
		fm := fileMeta{
			Path:         p,
			URL:          "/api/static-data/" + name,
			VersionedURL: "/api/static-data/" + name,
			Exists:       false,
		}
		if info, err := os.Stat(p); err == nil {
			fm.Exists = true
			fm.Size = info.Size()
			fm.ModTime = info.ModTime().UTC()
		}
		if meta.BuildVersion != "" {
			fm.VersionedURL = fm.URL + "?v=" + meta.BuildVersion
		} else if meta.BuildNumber > 0 {
			fm.VersionedURL = fm.URL + "?v=" + strconv.Itoa(meta.BuildNumber)
		}
		for key, fileName := range filesByKey {
			if fileName == name {
				meta.FileKeys[key] = fm
				break
			}
		}
	}

	detail := staticDataFileServeDetail(r, "", "meta", 0)
	detail["build_version"] = meta.BuildVersion
	detail["build_number"] = meta.BuildNumber
	detail["file_count"] = len(meta.FileKeys)
	detail["data_dir"] = dataDir

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
	logs.AttachHandlerSuccessDetail(r, "static data meta served", map[string]interface{}{
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
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for static data file", "static_data_file_method_not_allowed", "static_data", nil, map[string]interface{}{"method": r.Method, "file": errPrefix})
		return
	}

	dataDir := os.Getenv("SDE_DATA_DIR")
	if dataDir == "" {
		dataDir = sdecore.ResolveDataDir()
	}
	filePath := sdecore.LiveDataFilePath(dataDir, fileName)

	data, err := os.ReadFile(filePath)
	if err != nil {
		duration := time.Since(start)
		if os.IsNotExist(err) {
			shared.Errors.WithLabelValues(errPrefix + "_not_found").Inc(ctx)
			helper.RespondEndpointError(w, r, http.StatusNotFound, "static data file not found", "static data file not found", "static_data_file_not_found", "static_data", err, map[string]interface{}{"file": errPrefix, "file_path": filePath})
			return
		}
		shared.Errors.WithLabelValues(errPrefix + "_read_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "static_data_"+errPrefix, duration, "read_error",
			"error", err, "file_path", filePath)
		helper.RespondEndpointServerError(w, r, "failed to read static data file", "static data read error", "static_data_read_failed", "static_data", err, map[string]interface{}{"file": errPrefix, "file_path": filePath})
		return
	}

	var raw json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		duration := time.Since(start)
		shared.Errors.WithLabelValues(errPrefix + "_invalid_json").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "static_data_"+errPrefix, duration, "invalid_json",
			"error", err, "file_path", filePath)
		helper.RespondEndpointServerError(w, r, "static data file is invalid JSON", "static data invalid json", "static_data_invalid_json", "static_data", err, map[string]interface{}{"file": errPrefix, "file_path": filePath})
		return
	}

	// Cache policy for generated static files:
	// - URLs are build-versioned (?v=<build>), so they can be treated as immutable.
	// - Use a long but bounded TTL to align with periodic developer release cycles.
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

func staticDataFileServeDetail(r *http.Request, fileName, fileKey string, bytes int) map[string]interface{} {
	detail := map[string]interface{}{
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
