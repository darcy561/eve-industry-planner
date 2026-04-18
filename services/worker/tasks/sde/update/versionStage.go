package update

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"eve-industry-planner/shared/logs"
)

const latestBuildURL = "https://developers.eveonline.com/static-data/tranquility/latest.jsonl"
const buildZipURLTemplate = "https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-%d-jsonl.zip"

type versionFile struct {
	Version     string `json:"version"`
	BuildNumber int    `json:"build_number"`
	ReleaseDate string `json:"release_date"`
}

type latestBuildInfo struct {
	Key         string `json:"_key"`
	BuildNumber int    `json:"buildNumber"`
	ReleaseDate string `json:"releaseDate"`
	DownloadURL string `json:"-"`
}

type sdeVersionCheckResult struct {
	DataDir         string
	CurrentBuild    int
	CurrentVersion  string
	HasCurrent      bool
	LatestBuild     int
	LatestRelease   string
	LatestBuildInfo *latestBuildInfo
	NeedsUpdate     bool
}

func runSDEVersionCheckStage(ctx context.Context, dataDir string) (*sdeVersionCheckResult, error) {
	current, err := readCurrentVersion(dataDir)
	hasCurrentVersion := true
	if err != nil {
		if os.IsNotExist(err) {
			hasCurrentVersion = false
			logs.DebugCtx(ctx, "no local SDE version found; update required",
				"data_dir", dataDir,
				"expected_file", filepath.Join(dataDir, "version.json"),
			)
		} else {
			return nil, fmt.Errorf("failed reading current SDE version from %s: %w", dataDir, err)
		}
	}

	latest, err := fetchLatestBuild(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed fetching latest SDE build info: %w", err)
	}

	result := &sdeVersionCheckResult{
		DataDir:         dataDir,
		CurrentVersion:  "none",
		LatestBuild:     latest.BuildNumber,
		LatestRelease:   latest.ReleaseDate,
		LatestBuildInfo: latest,
		NeedsUpdate:     !hasCurrentVersion,
		HasCurrent:      hasCurrentVersion,
	}

	if hasCurrentVersion {
		result.CurrentBuild = current.BuildNumber
		result.CurrentVersion = current.Version
		result.NeedsUpdate = current.BuildNumber < latest.BuildNumber
	}

	logs.DebugCtx(ctx, "SDE version check completed",
		"data_dir", result.DataDir,
		"current_build", result.CurrentBuild,
		"current_version", result.CurrentVersion,
		"latest_build", result.LatestBuild,
		"latest_release_date", result.LatestRelease,
		"needs_update", result.NeedsUpdate,
	)

	return result, nil
}

func readCurrentVersion(dataDir string) (*versionFile, error) {
	versionPath := filepath.Join(dataDir, "version.json")
	data, err := os.ReadFile(versionPath)
	if err != nil {
		return nil, err
	}

	var current versionFile
	if err := json.Unmarshal(data, &current); err != nil {
		return nil, err
	}
	return &current, nil
}

func fetchLatestBuild(ctx context.Context) (*latestBuildInfo, error) {
	resp, err := httpGetOKWithRetry(ctx, latestBuildURL, "sde_fetch_latest_build")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var latest latestBuildInfo
	if err := json.Unmarshal(body, &latest); err != nil {
		return nil, err
	}
	latest.DownloadURL = buildJSONDataURL(latest.BuildNumber)
	return &latest, nil
}

func buildJSONDataURL(buildNumber int) string {
	if buildNumber <= 0 {
		return JSONDataURL
	}
	return fmt.Sprintf(buildZipURLTemplate, buildNumber)
}
