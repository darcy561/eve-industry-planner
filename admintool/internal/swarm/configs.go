// Configs sync eip.config.sync mounts to hashed Swarm config objects.
// Observability file: paths resolve from the eip binary (kit.ReadObs); other paths from disk.
package swarm

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"eve-industry-planner/admintool/internal/dockercli"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/stack"
)

// Discover returns unique key→file pairs for Swarm config object sync.
func DiscoverConfigs(stackPath string) ([]stack.ConfigMount, error) {
	doc, err := stack.Load(stackPath)
	if err != nil {
		return nil, err
	}
	return stack.ConfigSyncTargets(doc)
}

// Sync discovers targets from stack fragments and ensures Swarm config objects.
// Returns logical key → hashed object name. Missing stack files are errors.
func SyncConfigs(ctx context.Context, home string, stackFiles ...string) (map[string]string, error) {
	if len(stackFiles) == 0 {
		stackFiles = []string{kit.DataStackFile}
	}
	var targets []stack.ConfigMount
	seen := map[string]struct{}{}
	for _, f := range stackFiles {
		p, err := resolveStackPath(home, f)
		if err != nil {
			return nil, err
		}
		ts, err := DiscoverConfigs(p)
		if err != nil {
			return nil, err
		}
		for _, t := range ts {
			if _, ok := seen[t.Key]; ok {
				continue
			}
			seen[t.Key] = struct{}{}
			targets = append(targets, t)
		}
	}

	keyToObj := map[string]string{}
	for _, t := range targets {
		raw, err := resolveBytes(home, t.File)
		if err != nil {
			return nil, fmt.Errorf("config %s: %w", t.Key, err)
		}
		obj, err := ensureConfig(ctx, t.Key, raw)
		if err != nil {
			return nil, err
		}
		keyToObj[t.Key] = obj
	}
	return keyToObj, nil
}

func resolveStackPath(home, f string) (string, error) {
	p := f
	if !filepath.IsAbs(p) {
		p = filepath.Join(home, f)
	}
	if _, err := os.Stat(p); err != nil {
		return "", fmt.Errorf("missing stack file %s: %w", f, err)
	}
	return p, nil
}

func resolveBytes(home, file string) ([]byte, error) {
	if rel, ok := kit.EmbedRelFromHostFile(file); ok {
		return kit.ReadObs(rel)
	}
	path := file
	if !filepath.IsAbs(path) {
		path = filepath.Join(home, file)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("file missing %s: %w", path, err)
	}
	return raw, nil
}

func ensureConfig(ctx context.Context, key string, raw []byte) (string, error) {
	obj := Name(key, raw)
	if _, err := dockercli.RunOut(ctx, "config", "inspect", obj); err == nil {
		return obj, nil
	}
	if err := dockercli.CreateStdin(ctx, "config", obj, raw); err != nil {
		return "", err
	}
	return obj, nil
}
