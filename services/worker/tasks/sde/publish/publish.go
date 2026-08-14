// Package publish implements worker-only SDE live_data publish, rollback, and prune.
package publish

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	objectstore "eve-industry-planner/shared/core/objectstore"
	sdecore "eve-industry-planner/shared/core/sde"
)

type PublishResult struct {
	HasPreviousVersion bool
	ArchiveVersionName string
	CurrentRecipeList  []byte
	PreviousRecipeList []byte
	ReprocessingData   []byte
}

// PublishLive stages files into live_data, archives the previous live tree, writes root version.json last.
func PublishLive(ctx context.Context, b objectstore.Backend, files map[string][]byte, nextVersion sdecore.VersionJSON, replaceCurrentOnly bool, defaultDownloadURL string) (*PublishResult, error) {
	if b == nil {
		return nil, fmt.Errorf("nil store backend")
	}
	if len(files) == 0 {
		return nil, nil
	}

	result := &PublishResult{}
	for logicalPath, contents := range files {
		base := filepath.Base(logicalPath)
		switch base {
		case sdecore.RecipeListFile:
			result.CurrentRecipeList = contents
		case sdecore.ReprocessingFile:
			result.ReprocessingData = contents
		}
	}

	liveExists, err := liveDataExists(ctx, b)
	if err != nil {
		return nil, err
	}

	stagingPrefix := fmt.Sprintf(".live_data.tmp.%d/", time.Now().UnixNano())
	for logicalPath, contents := range files {
		fileName := filepath.Base(logicalPath)
		if err := b.Put(ctx, stagingPrefix+fileName, contents); err != nil {
			_ = b.DeletePrefix(ctx, stagingPrefix)
			return nil, fmt.Errorf("staging %s: %w", fileName, err)
		}
	}

	archiveName := ""
	if liveExists {
		result.HasPreviousVersion = true
		prevVersion, _ := sdecore.ReadRootVersionJSON(ctx, b)
		if prevBytes, err := sdecore.GetLiveFile(ctx, b, sdecore.RecipeListFile); err == nil {
			result.PreviousRecipeList = prevBytes
		}

		versionFolder := ""
		buildNumber := 0
		if prevVersion != nil {
			versionFolder = prevVersion.Version
			buildNumber = prevVersion.BuildNumber
		}
		archiveName, err = ResolveArchiveVersionName(ctx, b, versionFolder, buildNumber)
		if err != nil {
			_ = b.DeletePrefix(ctx, stagingPrefix)
			return nil, err
		}
		result.ArchiveVersionName = archiveName
		archivePrefix := sdecore.PreviousVersionsPrefix + archiveName + "/"

		if err := promoteStaging(ctx, b, stagingPrefix, archivePrefix, prevVersion, defaultDownloadURL, replaceCurrentOnly); err != nil {
			_ = b.DeletePrefix(ctx, stagingPrefix)
			return nil, err
		}
	} else {
		if err := b.CopyPrefix(ctx, stagingPrefix, sdecore.LiveDataPrefix); err != nil {
			_ = b.DeletePrefix(ctx, stagingPrefix)
			return nil, fmt.Errorf("promote staging to live_data: %w", err)
		}
		_ = b.DeletePrefix(ctx, stagingPrefix)
	}

	if nextVersion.Version == "" {
		label, err := NextBuildVersionName(ctx, b, nextVersion.BuildNumber)
		if err != nil {
			return nil, err
		}
		nextVersion.Version = label
	}
	if nextVersion.GeneratedAt.IsZero() {
		nextVersion.GeneratedAt = time.Now().UTC()
	}
	if nextVersion.DownloadedAt.IsZero() {
		nextVersion.DownloadedAt = time.Now().UTC()
	}
	if nextVersion.DownloadURL == "" {
		nextVersion.DownloadURL = defaultDownloadURL
	}
	if nextVersion.Source == "" {
		nextVersion.Source = "EVE Online Static Data"
	}
	if err := sdecore.WriteRootVersionJSON(ctx, b, nextVersion); err != nil {
		return nil, err
	}

	return result, nil
}

func promoteStaging(ctx context.Context, b objectstore.Backend, stagingPrefix, archivePrefix string, prevVersion *sdecore.VersionJSON, defaultDownloadURL string, replaceCurrentOnly bool) error {
	_ = replaceCurrentOnly

	if err := b.CopyPrefix(ctx, sdecore.LiveDataPrefix, archivePrefix); err != nil {
		return fmt.Errorf("archive live_data: %w", err)
	}
	if err := writeArchiveVersion(ctx, b, archivePrefix, prevVersion, defaultDownloadURL); err != nil {
		return err
	}
	if err := b.CopyPrefix(ctx, stagingPrefix, sdecore.LiveDataPrefix); err != nil {
		return fmt.Errorf("overwrite live_data from staging: %w", err)
	}
	_ = b.DeletePrefix(ctx, stagingPrefix)
	return nil
}

func renamePrefix(ctx context.Context, b objectstore.Backend, srcPrefix, dstPrefix string) error {
	if err := b.CopyPrefix(ctx, srcPrefix, dstPrefix); err != nil {
		return err
	}
	return b.DeletePrefix(ctx, srcPrefix)
}

func writeArchiveVersion(ctx context.Context, b objectstore.Backend, archivePrefix string, prevVersion *sdecore.VersionJSON, defaultDownloadURL string) error {
	name := strings.TrimSuffix(strings.TrimPrefix(archivePrefix, sdecore.PreviousVersionsPrefix), "/")
	v := sdecore.VersionJSON{
		Version:      name,
		DownloadURL:  defaultDownloadURL,
		DownloadedAt: time.Now().UTC(),
		GeneratedAt:  time.Now().UTC(),
		Source:       "EVE Online Static Data",
	}
	if prevVersion != nil {
		v.BuildNumber = prevVersion.BuildNumber
		v.ReleaseDate = prevVersion.ReleaseDate
		v.Key = prevVersion.Key
		if prevVersion.DownloadURL != "" {
			v.DownloadURL = prevVersion.DownloadURL
		}
		if !prevVersion.DownloadedAt.IsZero() {
			v.DownloadedAt = prevVersion.DownloadedAt
		}
		if prevVersion.Source != "" {
			v.Source = prevVersion.Source
		}
	}
	return sdecore.WriteVersionJSON(ctx, b, archivePrefix+sdecore.VersionObjectKey, v)
}

func liveDataExists(ctx context.Context, b objectstore.Backend) (bool, error) {
	for _, name := range sdecore.OutputFileNames() {
		ok, err := b.Exists(ctx, sdecore.LiveKey(name))
		if err != nil {
			return false, err
		}
		if ok {
			return true, nil
		}
	}
	keys, err := b.ListKeys(ctx, sdecore.LiveDataPrefix)
	if err != nil {
		return false, err
	}
	return len(keys) > 0, nil
}

func PrunePreviousVersions(ctx context.Context, b objectstore.Backend, keep int) error {
	if keep <= 0 {
		keep = sdecore.MaxPreviousVersions
	}
	names, err := b.ListChildNames(ctx, sdecore.PreviousVersionsPrefix)
	if err != nil {
		return err
	}
	type versionDir struct {
		name    string
		genTime time.Time
	}
	dirs := make([]versionDir, 0, len(names))
	for _, name := range names {
		if name == "" || strings.HasPrefix(name, ".") {
			continue
		}
		genTime := time.Time{}
		if data, err := b.Get(ctx, sdecore.PreviousVersionKey(name, sdecore.VersionObjectKey)); err == nil {
			var v sdecore.VersionJSON
			if json.Unmarshal(data, &v) == nil && !v.GeneratedAt.IsZero() {
				genTime = v.GeneratedAt
			}
		}
		if genTime.IsZero() {
			if info, err := b.Stat(ctx, sdecore.PreviousVersionKey(name, sdecore.VersionObjectKey)); err == nil {
				genTime = info.ModTime
			} else {
				genTime = time.Now().UTC()
			}
		}
		dirs = append(dirs, versionDir{name: name, genTime: genTime})
	}
	sort.Slice(dirs, func(i, j int) bool { return dirs[i].genTime.After(dirs[j].genTime) })
	if len(dirs) <= keep {
		return nil
	}
	for _, old := range dirs[keep:] {
		if err := b.DeletePrefix(ctx, sdecore.PreviousVersionsPrefix+old.name+"/"); err != nil {
			return fmt.Errorf("pruning %s: %w", old.name, err)
		}
	}
	return nil
}

func GetLatestPreviousVersion(ctx context.Context, b objectstore.Backend) (name string, version *sdecore.VersionJSON, err error) {
	names, err := b.ListChildNames(ctx, sdecore.PreviousVersionsPrefix)
	if err != nil {
		return "", nil, err
	}
	type versionDir struct {
		name    string
		genTime time.Time
		version *sdecore.VersionJSON
	}
	dirs := make([]versionDir, 0, len(names))
	for _, n := range names {
		if n == "" || strings.HasPrefix(n, ".") {
			continue
		}
		var parsed *sdecore.VersionJSON
		genTime := time.Time{}
		if data, err := b.Get(ctx, sdecore.PreviousVersionKey(n, sdecore.VersionObjectKey)); err == nil {
			var v sdecore.VersionJSON
			if json.Unmarshal(data, &v) == nil {
				parsed = &v
				if !v.GeneratedAt.IsZero() {
					genTime = v.GeneratedAt
				}
			}
		}
		if genTime.IsZero() {
			if info, err := b.Stat(ctx, sdecore.PreviousVersionKey(n, sdecore.RecipeListFile)); err == nil {
				genTime = info.ModTime
			} else {
				continue
			}
		}
		dirs = append(dirs, versionDir{name: n, genTime: genTime, version: parsed})
	}
	if len(dirs) == 0 {
		return "", nil, nil
	}
	sort.Slice(dirs, func(i, j int) bool { return dirs[i].genTime.After(dirs[j].genTime) })
	chosen := dirs[0]
	return chosen.name, chosen.version, nil
}

// RollbackLive swaps the latest previous_versions snapshot into live_data and archives the old live tree.
func RollbackLive(ctx context.Context, b objectstore.Backend, defaultDownloadURL string) (*sdecore.VersionJSON, error) {
	liveExists, err := liveDataExists(ctx, b)
	if err != nil {
		return nil, err
	}
	if !liveExists {
		return nil, fmt.Errorf("cannot rollback: live_data does not exist")
	}
	currentRoot, err := sdecore.ReadRootVersionJSON(ctx, b)
	if err != nil {
		return nil, err
	}
	rollbackName, rollbackVersion, err := GetLatestPreviousVersion(ctx, b)
	if err != nil {
		return nil, err
	}
	if rollbackName == "" {
		return nil, fmt.Errorf("cannot rollback: no previous versions available")
	}
	if rollbackVersion == nil || (rollbackVersion.BuildNumber == 0 && rollbackVersion.Version == "") {
		return nil, fmt.Errorf("cannot rollback: latest previous version is missing version.json metadata")
	}

	rollbackPrefix := sdecore.PreviousVersionsPrefix + rollbackName + "/"
	stagingOld := fmt.Sprintf(".live_data.rollback.%d/", time.Now().UnixNano())

	if err := b.CopyPrefix(ctx, sdecore.LiveDataPrefix, stagingOld); err != nil {
		return nil, err
	}
	if err := b.DeletePrefix(ctx, sdecore.LiveDataPrefix); err != nil {
		return nil, err
	}
	if err := b.CopyPrefix(ctx, rollbackPrefix, sdecore.LiveDataPrefix); err != nil {
		return nil, err
	}
	if err := b.DeletePrefix(ctx, rollbackPrefix); err != nil {
		return nil, err
	}

	archiveFolder := ""
	archiveBuild := 0
	if currentRoot != nil {
		archiveFolder = currentRoot.Version
		archiveBuild = currentRoot.BuildNumber
	}
	archiveFolder, err = ResolveArchiveVersionName(ctx, b, archiveFolder, archiveBuild)
	if err != nil {
		return nil, err
	}
	archivePrefix := sdecore.PreviousVersionsPrefix + archiveFolder + "/"

	if stagingOld != archivePrefix {
		if err := renamePrefix(ctx, b, stagingOld, archivePrefix); err != nil {
			return nil, fmt.Errorf("archive rolled-back live_data: %w", err)
		}
	}
	if err := writeArchiveVersion(ctx, b, archivePrefix, currentRoot, defaultDownloadURL); err != nil {
		return nil, err
	}
	_ = b.DeletePrefix(ctx, stagingOld)

	rollbackVersion.GeneratedAt = time.Now().UTC()
	if err := sdecore.WriteRootVersionJSON(ctx, b, *rollbackVersion); err != nil {
		return nil, err
	}
	return rollbackVersion, nil
}

var buildVersionPattern = regexp.MustCompile(`^(\d+)_v(\d+)$`)

func IsBuildVersionLabel(version string, buildNumber int) bool {
	if buildNumber <= 0 {
		return false
	}
	matches := buildVersionPattern.FindStringSubmatch(strings.TrimSpace(version))
	if len(matches) != 3 {
		return false
	}
	parsedBuild, err := strconv.Atoi(matches[1])
	if err != nil {
		return false
	}
	return parsedBuild == buildNumber
}

func NextBuildVersionName(ctx context.Context, b objectstore.Backend, buildNumber int) (string, error) {
	if buildNumber <= 0 {
		return NextUnknownVersionName(ctx, b)
	}
	names, err := b.ListChildNames(ctx, sdecore.PreviousVersionsPrefix)
	if err != nil {
		return "", err
	}
	maxVersion := 0
	for _, name := range names {
		matches := buildVersionPattern.FindStringSubmatch(strings.TrimSpace(name))
		if len(matches) != 3 {
			continue
		}
		parsedBuild, err := strconv.Atoi(matches[1])
		if err != nil || parsedBuild != buildNumber {
			continue
		}
		parsedVersion, err := strconv.Atoi(matches[2])
		if err != nil {
			continue
		}
		if parsedVersion > maxVersion {
			maxVersion = parsedVersion
		}
	}
	return fmt.Sprintf("%d_v%d", buildNumber, maxVersion+1), nil
}

func NextUnknownVersionName(ctx context.Context, b objectstore.Backend) (string, error) {
	baseName := "unknown"
	for versionNum := 1; ; versionNum++ {
		candidate := fmt.Sprintf("%s_v%d", baseName, versionNum)
		keys, err := b.ListKeys(ctx, sdecore.PreviousVersionsPrefix+candidate+"/")
		if err != nil {
			return "", err
		}
		if len(keys) == 0 {
			return candidate, nil
		}
	}
}

func ResolveArchiveVersionName(ctx context.Context, b objectstore.Backend, currentVersion string, buildNumber int) (string, error) {
	if IsBuildVersionLabel(currentVersion, buildNumber) {
		return currentVersion, nil
	}
	if buildNumber > 0 {
		return NextBuildVersionName(ctx, b, buildNumber)
	}
	return NextUnknownVersionName(ctx, b)
}
