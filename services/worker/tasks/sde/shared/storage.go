package shared

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	sdecore "eve-industry-planner/shared/core/sde"
	"golang.org/x/sys/unix"
)

const (
	LiveDataDirName           = "live_data"
	PreviousVersionsDirName   = "previous_versions"
	MaxPreviousVersionsToKeep = 5
	DefaultDataDir            = "/static-data"
	VersionLockFileName       = "sde_version_lock.json"
)

type StoredVersionJSON = sdecore.VersionJSON

type VersionLock struct {
	Version     string    `json:"version"`
	BuildNumber int       `json:"build_number"`
	LockedAt    time.Time `json:"locked_at"`
	Source      string    `json:"source,omitempty"`
	Reason      string    `json:"reason,omitempty"`
}

func AtomicSwapDirs(pathA, pathB string) error {
	return unix.Renameat2(unix.AT_FDCWD, pathA, unix.AT_FDCWD, pathB, unix.RENAME_EXCHANGE)
}

func AtomicWriteFile(path string, contents []byte, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tempPath := fmt.Sprintf("%s.tmp.%d", path, time.Now().UnixNano())
	if err := os.WriteFile(tempPath, contents, perm); err != nil {
		return err
	}
	if err := os.Rename(tempPath, path); err != nil {
		return err
	}
	return nil
}

func ReadRootVersionJSON(dataDir string) (*StoredVersionJSON, error) {
	return sdecore.ReadVersionJSON(dataDir)
}

func WriteRootVersionJSON(dataDir string, v StoredVersionJSON) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	versionPath := filepath.Join(dataDir, "version.json")
	return AtomicWriteFile(versionPath, data, 0o644)
}

func ReadVersionLock(dataDir string) (*VersionLock, error) {
	lockPath := filepath.Join(dataDir, VersionLockFileName)
	data, err := os.ReadFile(lockPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var lock VersionLock
	if err := json.Unmarshal(data, &lock); err != nil {
		return nil, err
	}
	return &lock, nil
}

func WriteVersionLock(dataDir string, lock VersionLock) error {
	if lock.LockedAt.IsZero() {
		lock.LockedAt = time.Now().UTC()
	}
	data, err := json.MarshalIndent(lock, "", "  ")
	if err != nil {
		return err
	}
	lockPath := filepath.Join(dataDir, VersionLockFileName)
	return AtomicWriteFile(lockPath, data, 0o644)
}

func WriteVersionJSONIntoDir(dir string, base *StoredVersionJSON, defaultDownloadURL string) error {
	v := StoredVersionJSON{
		Version:      "",
		BuildNumber:  0,
		ReleaseDate:  "",
		Key:          "",
		DownloadURL:  defaultDownloadURL,
		DownloadedAt: time.Now().UTC(),
		GeneratedAt:  time.Now().UTC(),
		Source:       "EVE Online Static Data",
	}

	if base != nil {
		v.Version = base.Version
		v.BuildNumber = base.BuildNumber
		v.ReleaseDate = base.ReleaseDate
		v.Key = base.Key
		v.DownloadURL = base.DownloadURL
		if !base.DownloadedAt.IsZero() {
			v.DownloadedAt = base.DownloadedAt
		}
		v.GeneratedAt = time.Now().UTC()
		if base.Source != "" {
			v.Source = base.Source
		}
	}

	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}

	versionPath := filepath.Join(dir, "version.json")
	return AtomicWriteFile(versionPath, data, 0o644)
}

func PrunePreviousVersions(previousRoot string, keep int) error {
	entries, err := os.ReadDir(previousRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("failed reading previous versions directory: %w", err)
	}

	type versionDir struct {
		name    string
		genTime time.Time
	}
	dirs := make([]versionDir, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		genTime := time.Time{}
		versionPath := filepath.Join(previousRoot, entry.Name(), "version.json")
		if b, err := os.ReadFile(versionPath); err == nil {
			var v StoredVersionJSON
			if err := json.Unmarshal(b, &v); err == nil && !v.GeneratedAt.IsZero() {
				genTime = v.GeneratedAt
			}
		}

		if genTime.IsZero() {
			info, err := entry.Info()
			if err != nil {
				continue
			}
			genTime = info.ModTime()
		}

		dirs = append(dirs, versionDir{name: entry.Name(), genTime: genTime})
	}

	sort.Slice(dirs, func(i, j int) bool { return dirs[i].genTime.After(dirs[j].genTime) })
	if len(dirs) <= keep {
		return nil
	}

	for _, old := range dirs[keep:] {
		removePath := filepath.Join(previousRoot, old.name)
		if err := os.RemoveAll(removePath); err != nil {
			return fmt.Errorf("failed pruning old version folder %s: %w", old.name, err)
		}
	}
	return nil
}

func GetLatestPreviousVersionDir(previousRoot string) (string, *StoredVersionJSON, error) {
	entries, err := os.ReadDir(previousRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil, nil
		}
		return "", nil, fmt.Errorf("failed reading previous versions directory: %w", err)
	}

	type versionDir struct {
		name    string
		genTime time.Time
		version *StoredVersionJSON
	}

	dirs := make([]versionDir, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		dirPath := filepath.Join(previousRoot, entry.Name())
		versionPath := filepath.Join(dirPath, "version.json")
		var parsed *StoredVersionJSON
		genTime := time.Time{}

		if b, err := os.ReadFile(versionPath); err == nil {
			var v StoredVersionJSON
			if err := json.Unmarshal(b, &v); err == nil {
				parsed = &v
				if !v.GeneratedAt.IsZero() {
					genTime = v.GeneratedAt
				}
			}
		}

		if genTime.IsZero() {
			info, err := entry.Info()
			if err != nil {
				continue
			}
			genTime = info.ModTime()
		}

		dirs = append(dirs, versionDir{name: entry.Name(), genTime: genTime, version: parsed})
	}

	if len(dirs) == 0 {
		return "", nil, nil
	}

	sort.Slice(dirs, func(i, j int) bool { return dirs[i].genTime.After(dirs[j].genTime) })
	chosen := dirs[0]
	return filepath.Join(previousRoot, chosen.name), chosen.version, nil
}

func SanitizeVersionFolder(version string) string {
	version = strings.TrimSpace(version)
	if version == "" || version == "none" || version == "unknown" {
		return fmt.Sprintf("unknown_%d", time.Now().Unix())
	}
	version = strings.ReplaceAll(version, "/", "_")
	version = strings.ReplaceAll(version, " ", "_")
	return version
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

func NextBuildVersionName(previousRoot string, buildNumber int) (string, error) {
	if buildNumber <= 0 {
		return NextUnknownVersionName(previousRoot)
	}

	maxVersion := 0
	entries, err := os.ReadDir(previousRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Sprintf("%d_v1", buildNumber), nil
		}
		return "", err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		matches := buildVersionPattern.FindStringSubmatch(strings.TrimSpace(entry.Name()))
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

func NextUnknownVersionName(previousRoot string) (string, error) {
	baseName := SanitizeVersionFolder("unknown")
	for versionNum := 1; ; versionNum++ {
		candidate := fmt.Sprintf("%s_v%d", baseName, versionNum)
		candidatePath := filepath.Join(previousRoot, candidate)
		if _, err := os.Stat(candidatePath); os.IsNotExist(err) {
			return candidate, nil
		} else if err != nil {
			return "", err
		}
	}
}

func ResolveArchiveVersionName(previousRoot string, currentVersion string, buildNumber int) (string, error) {
	if IsBuildVersionLabel(currentVersion, buildNumber) {
		return currentVersion, nil
	}
	if buildNumber > 0 {
		return NextBuildVersionName(previousRoot, buildNumber)
	}
	return NextUnknownVersionName(previousRoot)
}

func IntToString(v int) string {
	return fmt.Sprintf("%d", v)
}
