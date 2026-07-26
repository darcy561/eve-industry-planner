package stack

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"

	"eve-industry-planner/admintool/internal/kit"
)

// prepareComposeFiles rewrites observability configs.*.file to external stubs for
// docker compose config (bytes come from embed; Sync already created objects).
func prepareComposeFiles(home string, stackFiles []string) (paths []string, cleanup func(), err error) {
	var temps []string
	cleanup = func() {
		for _, p := range temps {
			_ = os.Remove(p)
		}
	}
	for _, f := range stackFiles {
		src := f
		if !filepath.IsAbs(src) {
			src = filepath.Join(home, f)
		}
		raw, err := os.ReadFile(src)
		if err != nil {
			cleanup()
			return nil, nil, err
		}
		out, changed, err := externalizeObservabilityConfigs(raw)
		if err != nil {
			cleanup()
			return nil, nil, fmt.Errorf("%s: %w", src, err)
		}
		if !changed {
			paths = append(paths, src)
			continue
		}
		tmp, err := os.CreateTemp("", "eip-compose-*.yml")
		if err != nil {
			cleanup()
			return nil, nil, err
		}
		tmpPath := tmp.Name()
		if _, err := tmp.Write(out); err != nil {
			_ = tmp.Close()
			_ = os.Remove(tmpPath)
			cleanup()
			return nil, nil, err
		}
		if err := tmp.Close(); err != nil {
			_ = os.Remove(tmpPath)
			cleanup()
			return nil, nil, err
		}
		temps = append(temps, tmpPath)
		paths = append(paths, tmpPath)
	}
	return paths, cleanup, nil
}

func externalizeObservabilityConfigs(raw []byte) ([]byte, bool, error) {
	var root yaml.Node
	if err := yaml.Unmarshal(raw, &root); err != nil {
		return nil, false, err
	}
	if root.Kind != yaml.DocumentNode || len(root.Content) == 0 {
		return raw, false, nil
	}
	doc := root.Content[0]
	if doc.Kind != yaml.MappingNode {
		return raw, false, nil
	}
	configs := mappingValue(doc, "configs")
	if configs == nil || configs.Kind != yaml.MappingNode {
		return raw, false, nil
	}
	changed := false
	for i := 0; i+1 < len(configs.Content); i += 2 {
		keyNode := configs.Content[i]
		valNode := configs.Content[i+1]
		if valNode.Kind != yaml.MappingNode {
			continue
		}
		fileNode := mappingValue(valNode, "file")
		if fileNode == nil {
			continue
		}
		file := strings.TrimSpace(fileNode.Value)
		if _, ok := kit.EmbedRelFromHostFile(file); !ok {
			continue
		}
		valNode.Content = []*yaml.Node{
			{Kind: yaml.ScalarNode, Tag: "!!str", Value: "external"},
			{Kind: yaml.ScalarNode, Tag: "!!bool", Value: "true"},
			{Kind: yaml.ScalarNode, Tag: "!!str", Value: "name"},
			{Kind: yaml.ScalarNode, Tag: "!!str", Value: "eip_pending_" + keyNode.Value},
		}
		changed = true
	}
	if !changed {
		return raw, false, nil
	}
	out, err := yaml.Marshal(&root)
	if err != nil {
		return nil, false, err
	}
	return out, true, nil
}
