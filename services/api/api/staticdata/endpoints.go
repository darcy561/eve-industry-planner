package staticdata

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	"eve-industry-planner/api/api/helper"
	sdecore "eve-industry-planner/shared/core/sde"
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
	serveStaticDataFile(w, r, sdecore.RecipeListFile)
}

func SearchIndexHandler(w http.ResponseWriter, r *http.Request) {
	serveStaticDataFile(w, r, sdecore.SearchIndexFile)
}

func FullItemListHandler(w http.ResponseWriter, r *http.Request) {
	serveStaticDataFile(w, r, sdecore.FullItemListFile)
}

func ReprocessingDataHandler(w http.ResponseWriter, r *http.Request) {
	serveStaticDataFile(w, r, sdecore.ReprocessingFile)
}

func MetaHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
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
		http.Error(w, fmt.Sprintf("failed to encode response: %v", err), http.StatusInternalServerError)
		return
	}
}

func serveStaticDataFile(w http.ResponseWriter, r *http.Request, fileName string) {
	if r.Method != http.MethodGet {
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
		if os.IsNotExist(err) {
			http.Error(w, "static data file not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to read static data file", http.StatusInternalServerError)
		return
	}

	var raw json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		http.Error(w, "static data file is invalid JSON", http.StatusInternalServerError)
		return
	}

	// Cache policy:
	// - Browser cache 5 minutes
	// - CDN/Cloudflare cache 24 hours
	// - Use versioned URL from meta (?v=<build>) for natural cache invalidation on update.
	w.Header().Set("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
	w.Header().Set("CDN-Cache-Control", "public, s-maxage=86400, stale-while-revalidate=86400")
	w.Header().Set("Cloudflare-CDN-Cache-Control", "public, s-maxage=86400, stale-while-revalidate=86400")
	w.Header().Set("Vary", "Accept-Encoding")

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
