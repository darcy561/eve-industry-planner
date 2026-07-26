// Package images pulls live GHCR/public images or bakes local TAG_* for eip dev.
package images

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"eve-industry-planner/admintool/internal/dockercli"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/kit"
)

var imageLine = regexp.MustCompile(`(?m)^\s*image:\s*(\S+)\s*$`)

// PullLive pulls unique image refs from app + data stack YAML (APP_VERSION substituted).
func PullLive(ctx context.Context, home string) error {
	envPath := filepath.Join(home, kit.EnvFile)
	m, err := kit.Map(envPath)
	if err != nil {
		return err
	}
	ver := kit.Get(m, "APP_VERSION")
	if ver == "" {
		return fmt.Errorf("APP_VERSION missing from %s", kit.EnvFile)
	}

	files := []string{
		filepath.Join(home, kit.AppStackFile),
		filepath.Join(home, kit.DataStackFile),
	}
	seen := map[string]struct{}{}
	var refs []string
	for _, f := range files {
		raw, err := os.ReadFile(f)
		if err != nil {
			return err
		}
		for _, match := range imageLine.FindAllStringSubmatch(string(raw), -1) {
			img := strings.Trim(match[1], `"'`)
			img = strings.ReplaceAll(img, "${APP_VERSION}", ver)
			img = strings.ReplaceAll(img, "${APP_VERSION:-}", ver)
			if img == "" || strings.Contains(img, "${") {
				continue
			}
			if _, ok := seen[img]; ok {
				continue
			}
			seen[img] = struct{}{}
			refs = append(refs, img)
		}
	}

	msg.Step("Pulling %d images…", len(refs))
	for _, ref := range refs {
		msg.Step("  pull %s", ref)
		if err := dockercli.Run(ctx, "pull", ref); err != nil {
			return fmt.Errorf("pull %s: %w", ref, err)
		}
	}
	return nil
}
