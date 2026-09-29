package update

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"eve-industry-planner/shared/logs"
)

const (
	// Same endpoint as the CLI tooling.
	JSONDataURL = "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip"
)

var requiredFiles = map[string]string{
	"blueprints.jsonl":              "Blueprints",
	"types.jsonl":                   "Types",
	"groups.jsonl":                  "Groups",
	"typeMaterials.jsonl":           "TypeMaterials",
	"marketGroups.jsonl":            "MarketGroups",
	"dogmaAttributes.jsonl":         "DogmaAttributes",
	"typeDogma.jsonl":               "TypeDogma",
	"mapSolarSystems.jsonl":         "SolarSystems",
	"dogmaEffects.jsonl":            "DogmaEffects",
	"industryTargetFilters.jsonl":   "IndustryTargetFilters",
	"industryModifierSources.jsonl": "IndustryModifierSources",
}

// sdeDownloadResult carries the downloaded archive to the map-build stage.
//
// Archive holds the compressed zip, which the next stage decompresses one entry
// at a time so only one file's bytes are live at once. ExtractedFiles is the
// already-decompressed form, used when a caller has the bytes in hand rather
// than an archive; the map-build stage takes whichever is set.
type sdeDownloadResult struct {
	Archive        *zip.Reader
	ExtractedFiles map[string][]byte
}

// runSDEDownloadStage handles stage 2 of the SDE task: download/extract when updates are needed.
func runSDEDownloadStage(ctx context.Context, versionResult *sdeVersionCheckResult) (*sdeDownloadResult, error) {
	if versionResult == nil {
		return &sdeDownloadResult{ExtractedFiles: map[string][]byte{}}, nil
	}

	if !versionResult.NeedsUpdate {
		logs.DebugCtx(ctx, "SDE download stage skipped; local data is current",
			"current_build", versionResult.CurrentBuild,
			"latest_build", versionResult.LatestBuild,
		)
		return &sdeDownloadResult{ExtractedFiles: map[string][]byte{}}, nil
	}

	downloadURL := JSONDataURL
	if versionResult.LatestBuildInfo != nil && versionResult.LatestBuildInfo.DownloadURL != "" {
		downloadURL = versionResult.LatestBuildInfo.DownloadURL
	}

	archive, compressedBytes, err := downloadJSONArchiveInMemory(ctx, requiredFiles, downloadURL)
	if err != nil {
		return nil, fmt.Errorf("sde in-memory download failed: %w", err)
	}

	logs.DebugCtx(ctx, "SDE download completed (in-memory)",
		"compressed_bytes", compressedBytes,
		"entries", len(archive.File),
	)

	return &sdeDownloadResult{Archive: archive}, nil
}

// openArchiveEntry returns the decompressed contents of one required file.
func openArchiveEntry(archive *zip.Reader, filename string) ([]byte, error) {
	for _, file := range archive.File {
		if !strings.HasSuffix(file.Name, ".jsonl") {
			continue
		}
		// Match exact filename only (basename), not substring, to avoid accidental matches.
		if filepath.Base(file.Name) != filename {
			continue
		}

		rc, err := file.Open()
		if err != nil {
			return nil, fmt.Errorf("open %s in zip: %w", filename, err)
		}

		// Sized from the zip directory rather than grown by io.ReadAll, whose
		// doubling leaves discarded half-sized buffers live alongside the result.
		data := make([]byte, 0, file.UncompressedSize64)
		buf := bytes.NewBuffer(data)
		_, err = io.Copy(buf, rc)
		_ = rc.Close()
		if err != nil {
			return nil, fmt.Errorf("read %s in zip: %w", filename, err)
		}
		return buf.Bytes(), nil
	}
	return nil, fmt.Errorf("missing file in zip: %s", filename)
}

func downloadJSONArchiveInMemory(ctx context.Context, specificFiles map[string]string, downloadURL string) (*zip.Reader, int, error) {
	maxBytes := int64(0)
	if v := os.Getenv("SDE_IN_MEMORY_MAX_BYTES"); v != "" {
		parsed, err := strconv.ParseInt(v, 10, 64)
		if err == nil && parsed > 0 {
			maxBytes = parsed
		}
	}

	logs.DebugCtx(ctx, "SDE downloading static-data zip (in-memory)",
		"url", downloadURL,
		"max_bytes", maxBytes,
	)

	resp, err := httpGetOKWithRetry(ctx, downloadURL, "sde_download_static_zip")
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("download failed with status %d", resp.StatusCode)
	}

	var reader io.Reader = resp.Body
	if maxBytes > 0 {
		reader = io.LimitReader(resp.Body, maxBytes+1) // +1 so we can detect overflow
	}

	body, err := io.ReadAll(reader)
	if err != nil {
		return nil, 0, err
	}
	if maxBytes > 0 && int64(len(body)) > maxBytes {
		return nil, 0, fmt.Errorf("download exceeded SDE_IN_MEMORY_MAX_BYTES (%d bytes)", maxBytes)
	}

	// zip.Reader needs random access, so the compressed bytes stay live for as
	// long as entries are being read from it.
	archive, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		return nil, 0, err
	}

	// Checked against the zip directory before any entry is decompressed, so a
	// bad archive fails here rather than part-way through the map build.
	present := make(map[string]struct{}, len(specificFiles))
	for _, file := range archive.File {
		if !strings.HasSuffix(file.Name, ".jsonl") {
			continue
		}
		name := filepath.Base(file.Name)
		if _, wanted := specificFiles[name]; wanted {
			present[name] = struct{}{}
		}
	}
	missing := make([]string, 0, len(specificFiles))
	for name := range specificFiles {
		if _, ok := present[name]; !ok {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return nil, 0, fmt.Errorf("missing required jsonl files in zip: %v", missing)
	}

	return archive, len(body), nil
}
