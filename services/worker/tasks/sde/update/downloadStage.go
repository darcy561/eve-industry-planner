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
	"blueprints.jsonl":      "Blueprints",
	"types.jsonl":           "Types",
	"typeMaterials.jsonl":   "TypeMaterials",
	"marketGroups.jsonl":    "MarketGroups",
	"dogmaAttributes.jsonl": "DogmaAttributes",
	"typeDogma.jsonl":       "TypeDogma",
}

type sdeDownloadResult struct {
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

	extracted, err := downloadAndExtractJSONInMemory(ctx, requiredFiles, downloadURL)
	if err != nil {
		return nil, fmt.Errorf("sde in-memory download/extract failed: %w", err)
	}

	// For now we keep extracted JSONL bytes in memory only; subsequent stages will parse/store.
	totalBytes := 0
	for _, b := range extracted {
		totalBytes += len(b)
	}
	logs.DebugCtx(ctx, "SDE download/extract completed (in-memory)",
		"extracted_files", len(extracted),
		"total_extracted_bytes", totalBytes,
		"files", fileSizes(extracted),
	)

	return &sdeDownloadResult{ExtractedFiles: extracted}, nil
}

func fileSizes(files map[string][]byte) map[string]int {
	out := make(map[string]int, len(files))
	for k, v := range files {
		out[k] = len(v)
	}
	return out
}

func downloadAndExtractJSONInMemory(ctx context.Context, specificFiles map[string]string, downloadURL string) (map[string][]byte, error) {
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
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download failed with status %d", resp.StatusCode)
	}

	var reader io.Reader = resp.Body
	if maxBytes > 0 {
		reader = io.LimitReader(resp.Body, maxBytes+1) // +1 so we can detect overflow
	}

	body, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}
	if maxBytes > 0 && int64(len(body)) > maxBytes {
		return nil, fmt.Errorf("download exceeded SDE_IN_MEMORY_MAX_BYTES (%d bytes)", maxBytes)
	}

	zipReader, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		return nil, err
	}

	extracted := make(map[string][]byte, len(specificFiles))
	for _, file := range zipReader.File {
		if !strings.HasSuffix(file.Name, ".jsonl") {
			continue
		}

		// Match exact filename only (basename), not substring, to avoid accidental matches.
		targetFile := filepath.Base(file.Name)
		if _, wanted := specificFiles[targetFile]; !wanted {
			continue
		}
		if _, already := extracted[targetFile]; already {
			continue
		}

		rc, err := file.Open()
		if err != nil {
			logs.WarnCtx(ctx, "SDE failed opening jsonl file in zip",
				"zip_path", file.Name,
				"target", targetFile,
				"error", err,
			)
			continue
		}

		data, err := io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			logs.WarnCtx(ctx, "SDE failed reading jsonl file in zip",
				"zip_path", file.Name,
				"target", targetFile,
				"error", err,
			)
			continue
		}

		extracted[targetFile] = data
	}

	missing := make([]string, 0, len(specificFiles))
	for targetFile := range specificFiles {
		if _, ok := extracted[targetFile]; !ok {
			missing = append(missing, targetFile)
		}
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required jsonl files in zip: %v", missing)
	}

	return extracted, nil
}
