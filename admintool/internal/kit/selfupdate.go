// package kit replaces the running eip binary from GitHub Releases.
package kit

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// DefaultRepo is owner/name for GitHub Releases (override with EIP_UPDATE_REPO).
const DefaultRepo = "darcy561/eve-industry-planner"

// Result describes a completed or dry-run update.
type Result struct {
	Current   string
	Latest    string
	Asset     string
	URL       string
	Skipped   bool // already up to date
	DryRun    bool
	Installed bool
}

// Options configures SelfUpdate.
type Options struct {
	CurrentVersion string
	Repo           string // owner/name; empty → DefaultRepo or EIP_UPDATE_REPO
	// Tag selects a Release by tag (e.g. prerelease, prerelease-swarm-foo).
	// Empty → EIP_UPDATE_TAG env, else GitHub /releases/latest (Public).
	Tag        string
	DryRun     bool
	HTTPClient *http.Client
	Executable string // empty → os.Executable()
}

// SelfUpdate downloads the matching GitHub Release asset and replaces the on-disk
// eip binary (used by eip update-binary). Embedded kit travels with the binary.
func SelfUpdate(ctx context.Context, opts Options) (Result, error) {
	repo := strings.TrimSpace(opts.Repo)
	if repo == "" {
		repo = strings.TrimSpace(os.Getenv("EIP_UPDATE_REPO"))
	}
	if repo == "" {
		repo = DefaultRepo
	}
	client := opts.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 120 * time.Second}
	}

	exe := opts.Executable
	if exe == "" {
		var err error
		exe, err = os.Executable()
		if err != nil {
			return Result{}, fmt.Errorf("selfupdate: executable: %w", err)
		}
	}
	exe, err := filepath.EvalSymlinks(exe)
	if err != nil {
		return Result{}, fmt.Errorf("selfupdate: resolve executable: %w", err)
	}

	_ = os.Remove(exe + ".old")

	current := normalizeVersion(opts.CurrentVersion)
	tag := strings.TrimSpace(opts.Tag)
	if tag == "" {
		tag = strings.TrimSpace(os.Getenv("EIP_UPDATE_TAG"))
	}
	var rel ghRelease
	if tag != "" {
		rel, err = fetchReleaseByTag(ctx, client, repo, tag)
	} else {
		rel, err = fetchLatest(ctx, client, repo)
	}
	if err != nil {
		return Result{}, err
	}
	latest := normalizeVersion(rel.TagName)
	assetName := AssetName(runtime.GOOS, runtime.GOARCH)
	asset, ok := rel.findAsset(assetName)
	if !ok {
		return Result{}, fmt.Errorf("selfupdate: release %s has no asset %q", rel.TagName, assetName)
	}

	out := Result{
		Current: current,
		Latest:  latest,
		Asset:   assetName,
		URL:     asset.BrowserDownloadURL,
		DryRun:  opts.DryRun,
	}
	if current != "" && current == latest {
		out.Skipped = true
		return out, nil
	}
	if opts.DryRun {
		return out, nil
	}

	sums, err := fetchSHA256SUMS(ctx, client, rel)
	if err != nil {
		return Result{}, err
	}
	wantSum, ok := sums[assetName]
	if !ok {
		return Result{}, fmt.Errorf("selfupdate: SHA256SUMS missing entry for %s", assetName)
	}

	newPath := exe + ".new"
	if err := downloadFile(ctx, client, asset.BrowserDownloadURL, newPath); err != nil {
		_ = os.Remove(newPath)
		return Result{}, err
	}
	got, err := fileSHA256(newPath)
	if err != nil {
		_ = os.Remove(newPath)
		return Result{}, err
	}
	if !strings.EqualFold(got, wantSum) {
		_ = os.Remove(newPath)
		return Result{}, fmt.Errorf("selfupdate: checksum mismatch for %s", assetName)
	}
	if runtime.GOOS != "windows" {
		if err := os.Chmod(newPath, 0o755); err != nil {
			_ = os.Remove(newPath)
			return Result{}, err
		}
	}

	oldPath := exe + ".old"
	if err := os.Rename(exe, oldPath); err != nil {
		_ = os.Remove(newPath)
		return Result{}, fmt.Errorf("selfupdate: rename current -> .old: %w", err)
	}
	if err := os.Rename(newPath, exe); err != nil {
		_ = os.Rename(oldPath, exe) // rollback
		_ = os.Remove(newPath)
		return Result{}, fmt.Errorf("selfupdate: rename .new -> current: %w", err)
	}

	out.Installed = true
	return out, nil
}

// AssetName returns the Release asset filename for goos/goarch.
func AssetName(goos, goarch string) string {
	name := fmt.Sprintf("eip-%s-%s", goos, goarch)
	if goos == "windows" {
		name += ".exe"
	}
	return name
}

func normalizeVersion(v string) string {
	v = strings.TrimSpace(v)
	return strings.TrimPrefix(v, "v")
}

type ghRelease struct {
	TagName string    `json:"tag_name"`
	Assets  []ghAsset `json:"assets"`
}

type ghAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

func (r ghRelease) findAsset(name string) (ghAsset, bool) {
	for _, a := range r.Assets {
		if a.Name == name {
			return a, true
		}
	}
	return ghAsset{}, false
}

func fetchLatest(ctx context.Context, client *http.Client, repo string) (ghRelease, error) {
	return fetchReleaseURL(ctx, client, fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", repo), "latest release")
}

func fetchReleaseByTag(ctx context.Context, client *http.Client, repo, tag string) (ghRelease, error) {
	tag = strings.TrimPrefix(strings.TrimSpace(tag), "v")
	// Channel tags are literal (prerelease, prerelease-swarm-foo); semver tags may be stored with or without v.
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/tags/%s", repo, tag)
	rel, err := fetchReleaseURL(ctx, client, url, "release "+tag)
	if err == nil {
		return rel, nil
	}
	// Retry with v-prefix for classic semver Release tags.
	if !strings.HasPrefix(tag, "v") && strings.Contains(tag, ".") && !strings.HasPrefix(tag, "prerelease") {
		return fetchReleaseURL(ctx, client, fmt.Sprintf("https://api.github.com/repos/%s/releases/tags/v%s", repo, tag), "release v"+tag)
	}
	return ghRelease{}, err
}

func fetchReleaseURL(ctx context.Context, client *http.Client, url, label string) (ghRelease, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return ghRelease{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "eip-selfupdate")
	resp, err := client.Do(req)
	if err != nil {
		return ghRelease{}, fmt.Errorf("selfupdate: %s: %w", label, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return ghRelease{}, fmt.Errorf("selfupdate: %s: HTTP %d: %s", label, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var rel ghRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return ghRelease{}, fmt.Errorf("selfupdate: decode %s: %w", label, err)
	}
	if rel.TagName == "" {
		return ghRelease{}, fmt.Errorf("selfupdate: %s missing tag_name", label)
	}
	return rel, nil
}

func fetchSHA256SUMS(ctx context.Context, client *http.Client, rel ghRelease) (map[string]string, error) {
	asset, ok := rel.findAsset("SHA256SUMS")
	if !ok {
		return nil, fmt.Errorf("selfupdate: release %s has no SHA256SUMS asset", rel.TagName)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, asset.BrowserDownloadURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "eip-selfupdate")
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("selfupdate: SHA256SUMS: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("selfupdate: SHA256SUMS: HTTP %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	return parseSHA256SUMS(string(raw)), nil
}

func parseSHA256SUMS(text string) map[string]string {
	out := map[string]string{}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		sum := fields[0]
		name := fields[len(fields)-1]
		name = strings.TrimPrefix(name, "*")
		out[filepath.Base(name)] = sum
	}
	return out
}

func downloadFile(ctx context.Context, client *http.Client, url, dest string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "eip-selfupdate")
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("selfupdate: download: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("selfupdate: download: HTTP %d", resp.StatusCode)
	}
	f, err := os.OpenFile(dest, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := io.Copy(f, resp.Body); err != nil {
		return err
	}
	return f.Close()
}

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
