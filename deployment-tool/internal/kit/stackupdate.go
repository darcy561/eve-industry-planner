package kit

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// StackFiles are the deploy-home compose files refreshed by eip update / init.
var StackFiles = []string{AppStackFile, DataStackFile, ObsStackFile}

// StacksMissing reports whether any StackFiles are absent under home.
func StacksMissing(home string) bool {
	if strings.TrimSpace(home) == "" {
		var err error
		home, err = Home()
		if err != nil {
			return true
		}
	}
	for _, name := range StackFiles {
		st, err := os.Stat(filepath.Join(home, name))
		if err != nil || st.IsDir() {
			return true
		}
	}
	return false
}

// StackUpdateResult describes stack file refresh.
type StackUpdateResult struct {
	Branch    string
	Updated   []string
	Unchanged []string
	DryRun    bool
}

// StackUpdateOptions configures UpdateStacks.
type StackUpdateOptions struct {
	Home        string // empty → Home()
	Branch      string // empty → ResolveKitBranch()
	Repo        string // owner/name; empty → DefaultRepo
	DryRun      bool
	MissingOnly bool // if true, never overwrite existing stack files (eip init)
	HTTPClient  *http.Client
}

// UpdateStacks fetches docker-stack*.yml from the kit git branch tip and writes
// them when content differs (or when missing, if MissingOnly). Never touches .env.
func UpdateStacks(ctx context.Context, opts StackUpdateOptions) (StackUpdateResult, error) {
	home := strings.TrimSpace(opts.Home)
	if home == "" {
		var err error
		home, err = Home()
		if err != nil {
			return StackUpdateResult{}, err
		}
	}
	branch := strings.TrimSpace(opts.Branch)
	if branch == "" {
		branch = ResolveKitBranch()
	}
	repo := strings.TrimSpace(opts.Repo)
	if repo == "" {
		repo = strings.TrimSpace(os.Getenv("EIP_UPDATE_REPO"))
	}
	if repo == "" {
		repo = DefaultRepo
	}
	client := opts.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 60 * time.Second}
	}

	base := fmt.Sprintf("https://raw.githubusercontent.com/%s/refs/heads/%s", repo, branch)
	out := StackUpdateResult{Branch: branch, DryRun: opts.DryRun}

	for _, name := range StackFiles {
		dest := filepath.Join(home, name)
		if opts.MissingOnly {
			if st, err := os.Stat(dest); err == nil && !st.IsDir() {
				out.Unchanged = append(out.Unchanged, name)
				continue
			}
		}
		url := base + "/" + name
		body, err := downloadBytes(ctx, client, url)
		if err != nil {
			return out, fmt.Errorf("stacks: %s: %w", name, err)
		}
		if !opts.MissingOnly {
			same, err := fileContentEqual(dest, body)
			if err != nil {
				return out, err
			}
			if same {
				out.Unchanged = append(out.Unchanged, name)
				continue
			}
		}
		out.Updated = append(out.Updated, name)
		if opts.DryRun {
			continue
		}
		if err := os.WriteFile(dest, body, 0o644); err != nil {
			return out, fmt.Errorf("stacks: write %s: %w", name, err)
		}
	}
	return out, nil
}

func downloadBytes(ctx context.Context, client *http.Client, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "eip-update")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return io.ReadAll(io.LimitReader(resp.Body, 8<<20))
}

func fileContentEqual(path string, want []byte) (bool, error) {
	got, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return false, nil
		}
		return false, err
	}
	if len(got) != len(want) {
		return false, nil
	}
	sumGot := sha256.Sum256(got)
	sumWant := sha256.Sum256(want)
	return hex.EncodeToString(sumGot[:]) == hex.EncodeToString(sumWant[:]), nil
}
