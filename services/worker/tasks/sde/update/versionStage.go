package update

import (
	"context"
	"encoding/json"
	"errors"
	sdecore "eve-industry-planner/shared/core/sde"
	"fmt"
	"io"
	"net/http"

	objectstore "eve-industry-planner/shared/core/objectstore"
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
	CurrentBuild    int
	CurrentVersion  string
	HasCurrent      bool
	LatestBuild     int
	LatestRelease   string
	LatestBuildInfo *latestBuildInfo
	NeedsUpdate     bool
}

func runSDEVersionCheckStage(ctx context.Context) (*sdeVersionCheckResult, error) {
	current, err := readCurrentVersion(ctx)
	hasCurrentVersion := true
	if err != nil {
		if errors.Is(err, objectstore.ErrNotFound) {
			hasCurrentVersion = false
			logs.DebugCtx(ctx, "no SDE version in object store; update required")
		} else {
			return nil, fmt.Errorf("failed reading current SDE version: %w", err)
		}
	}

	latest, err := fetchLatestBuild(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed fetching latest SDE build info: %w", err)
	}

	result := &sdeVersionCheckResult{
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
		"current_build", result.CurrentBuild,
		"current_version", result.CurrentVersion,
		"latest_build", result.LatestBuild,
		"latest_release_date", result.LatestRelease,
		"needs_update", result.NeedsUpdate,
	)

	return result, nil
}

func readCurrentVersion(ctx context.Context) (*versionFile, error) {
	backend, err := objectstore.OpenStaticData(ctx)
	if err != nil {
		return nil, err
	}
	v, err := sdecore.ReadRootVersionJSON(ctx, backend)
	if err != nil {
		return nil, err
	}
	if v == nil {
		return nil, objectstore.ErrNotFound
	}
	return &versionFile{
		Version:     v.Version,
		BuildNumber: v.BuildNumber,
		ReleaseDate: v.ReleaseDate,
	}, nil
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
