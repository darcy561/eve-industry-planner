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
		duration := time.Since(start)
		m.Errors.WithLabelValues("meta_method_not_allowed").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "static_data_meta", duration, "method_not_allowed")
		logs.WarnCtx(ctx, "invalid method for static data meta endpoint")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
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

	if err := helper.EncodeJSON(w, meta); err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("meta_encode_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "static_data_meta", duration, "encode_error", "error", err)
		logs.ErrorCtx(ctx, "static data meta encode error", "error", err)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, fmt.Sprintf("failed to encode response: %v", err), err)
		return
	}

	duration := time.Since(start)
	m.Meta.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.Meta.RequestsCount.Inc(ctx)
	apimetrics.LogRequestMetrics(ctx, "static_data_meta", duration, "success")
}

func serveStaticDataFile(w http.ResponseWriter, r *http.Request, fileName string, fileMetrics *apimetrics.StaticDataFileMetrics, errPrefix string) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	shared := apimetrics.GetAPIStaticData()

	if r.Method != http.MethodGet {
		duration := time.Since(start)
		shared.Errors.WithLabelValues(errPrefix + "_method_not_allowed").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "static_data_"+errPrefix, duration, "method_not_allowed")
		logs.WarnCtx(ctx, "invalid method for static data file", "file", errPrefix)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
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
			apimetrics.LogRequestMetrics(ctx, "static_data_"+errPrefix, duration, "not_found", "file_path", filePath)
			logs.WarnCtx(ctx, "static data file not found", "file", errPrefix, "file_path", filePath)
			http.Error(w, "static data file not found", http.StatusNotFound)
			return
		}
		shared.Errors.WithLabelValues(errPrefix + "_read_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "static_data_"+errPrefix, duration, "read_error",
			"error", err, "file_path", filePath)
		logs.ErrorCtx(ctx, "static data read error", "error", err, "file", errPrefix, "file_path", filePath)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "failed to read static data file", err)
		return
	}

	var raw json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		duration := time.Since(start)
		shared.Errors.WithLabelValues(errPrefix + "_invalid_json").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "static_data_"+errPrefix, duration, "invalid_json",
			"error", err, "file_path", filePath)
		logs.ErrorCtx(ctx, "static data invalid json", "error", err, "file", errPrefix, "file_path", filePath)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "static data file is invalid JSON", err)
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

	duration := time.Since(start)
	fileMetrics.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	fileMetrics.RequestsCount.Inc(ctx)
	apimetrics.LogRequestMetrics(ctx, "static_data_"+errPrefix, duration, "success")
}
