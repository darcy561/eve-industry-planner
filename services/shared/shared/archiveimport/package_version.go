package archiveimport

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// DefaultCanonicalBuildVer can be set at link time for minimal images, e.g.
//
//	-ldflags '-X eve-industry-planner/shared/shared/archiveimport.DefaultCanonicalBuildVer=0.8.05'
var DefaultCanonicalBuildVer string

// ResolveCanonicalBuildVer returns a migration/trace string for logs and CLI output.
// It is not persisted on normalized job documents. Order:
// 1. buildVerFlag (e.g. optional task payload override)
// 2. CANONICAL_BUILD_VER environment variable
// 3. DefaultCanonicalBuildVer (link-time)
// 4. [VersionFromTextFile] for worker VERSION (worker image: /app/worker/VERSION; dev: services/worker/VERSION)
// 5. package.json "version" if packageJSONFlag set or under common dev paths
func ResolveCanonicalBuildVer(buildVerFlag, packageJSONFlag string) (string, error) {
	if v := strings.TrimSpace(buildVerFlag); v != "" {
		return v, nil
	}
	if v := strings.TrimSpace(os.Getenv("CANONICAL_BUILD_VER")); v != "" {
		return v, nil
	}
	if v := strings.TrimSpace(DefaultCanonicalBuildVer); v != "" {
		return v, nil
	}

	workerVerFiles := []string{
		"/app/worker/VERSION",
		"worker/VERSION",
		"../worker/VERSION",
		filepath.Join("services", "worker", "VERSION"),
		filepath.Join("..", "..", "worker", "VERSION"),
	}
	var lastErr error
	for _, p := range workerVerFiles {
		v, err := VersionFromTextFile(p)
		if err == nil {
			return v, nil
		}
		lastErr = err
	}

	var pkgCandidates []string
	if p := strings.TrimSpace(packageJSONFlag); p != "" {
		pkgCandidates = append(pkgCandidates, p)
	}
	pkgCandidates = append(pkgCandidates,
		"../frontend/package.json",
		"frontend/package.json",
		filepath.Join("..", "..", "frontend", "package.json"),
	)

	for _, p := range pkgCandidates {
		v, err := VersionFromPackageJSON(p)
		if err == nil {
			return v, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return "", fmt.Errorf("%w — set CANONICAL_BUILD_VER, optional task payload canonical_build_ver, or ship worker/VERSION in the worker image (/app/worker/VERSION)", lastErr)
	}
	return "", fmt.Errorf("canonical build version: set -build-ver or CANONICAL_BUILD_VER")
}

// VersionFromTextFile reads a release/build version from a plain text file (single line, trimmed).
func VersionFromTextFile(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	v := strings.TrimSpace(string(b))
	if v == "" {
		return "", fmt.Errorf("%s: empty or whitespace only", path)
	}
	return v, nil
}

// VersionFromPackageJSON reads the "version" field from a package.json (npm) file.
func VersionFromPackageJSON(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	var wrap struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(b, &wrap); err != nil {
		return "", err
	}
	if wrap.Version == "" {
		return "", fmt.Errorf("%s: missing \"version\"", path)
	}
	return wrap.Version, nil
}
