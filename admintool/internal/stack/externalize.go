package stack

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"

	"eve-industry-planner/admintool/internal/kit"
)

// composeSource is one -f input for docker compose config.
// Path is an on-disk stack fragment. YAML is an in-memory rewrite (obs configs
// stubbed to external + relative binds absoluteized against project home).
// Fed via docker compose -f -; never write rewrite temps into the project home.
type composeSource struct {
	Path string
	YAML []byte
}

// prepareComposeSources rewrites observability configs.*.file to external stubs
// in memory for docker compose config (bytes come from embed; Sync already
// created objects). Relative bind sources (./mongo-keyfile) are absoluteized
// against home so resolution does not depend on compose file location / cwd.
// Unchanged fragments keep their on-disk path.
func prepareComposeSources(home string, stackFiles []string) ([]composeSource, error) {
	out := make([]composeSource, 0, len(stackFiles))
	for _, f := range stackFiles {
		src := f
		if !filepath.IsAbs(src) {
			src = filepath.Join(home, f)
		}
		raw, err := os.ReadFile(src)
		if err != nil {
			return nil, err
		}
		rewritten, changed, err := externalizeObservabilityConfigs(raw)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", src, err)
		}
		if !changed {
			out = append(out, composeSource{Path: src})
			continue
		}
		abs, err := absoluteizeRelativeBindSources(home, rewritten)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", src, err)
		}
		out = append(out, composeSource{YAML: abs})
	}
	return out, nil
}

// composeConfigInvocation builds docker compose config argv + optional stdin.
// Pure helper for unit tests (no Docker).
func composeConfigInvocation(home string, sources []composeSource) (args []string, stdin []byte, err error) {
	args = []string{"compose", "--env-file", filepath.Join(home, kit.EnvFile)}
	stdinFiles := 0
	for _, s := range sources {
		if len(s.YAML) > 0 {
			stdinFiles++
			if stdinFiles > 1 {
				return nil, nil, fmt.Errorf("stack: more than one in-memory compose rewrite in one expand (unsupported)")
			}
			args = append(args, "-f", "-")
			stdin = append(stdin, s.YAML...)
			continue
		}
		if s.Path == "" {
			return nil, nil, fmt.Errorf("stack: empty compose source")
		}
		args = append(args, "-f", s.Path)
	}
	args = append(args, "config")
	return args, stdin, nil
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
	marshaled, err := yaml.Marshal(&root)
	if err != nil {
		return nil, false, err
	}
	return marshaled, true, nil
}

// absoluteizeRelativeBindSources rewrites long-form bind mount sources that are
// relative (./ or ../) to absolute paths under home. Named volumes and absolute
// sources are left unchanged. OS-native separators via filepath.Join.
func absoluteizeRelativeBindSources(home string, raw []byte) ([]byte, error) {
	if strings.TrimSpace(home) == "" {
		return nil, fmt.Errorf("empty home")
	}
	var root yaml.Node
	if err := yaml.Unmarshal(raw, &root); err != nil {
		return nil, err
	}
	if root.Kind != yaml.DocumentNode || len(root.Content) == 0 {
		return raw, nil
	}
	doc := root.Content[0]
	if doc.Kind != yaml.MappingNode {
		return raw, nil
	}
	services := mappingValue(doc, "services")
	if services == nil || services.Kind != yaml.MappingNode {
		return raw, nil
	}
	changed := false
	for i := 0; i+1 < len(services.Content); i += 2 {
		svc := services.Content[i+1]
		if svc.Kind != yaml.MappingNode {
			continue
		}
		vols := mappingValue(svc, "volumes")
		if vols == nil || vols.Kind != yaml.SequenceNode {
			continue
		}
		for _, item := range vols.Content {
			if item.Kind != yaml.MappingNode {
				continue
			}
			typeNode := mappingValue(item, "type")
			if typeNode == nil || strings.TrimSpace(typeNode.Value) != "bind" {
				continue
			}
			srcNode := mappingValue(item, "source")
			if srcNode == nil {
				continue
			}
			src := strings.TrimSpace(srcNode.Value)
			abs, ok := absoluteBindSource(home, src)
			if !ok {
				continue
			}
			srcNode.Value = abs
			srcNode.Tag = "!!str"
			changed = true
		}
	}
	if !changed {
		return raw, nil
	}
	return yaml.Marshal(&root)
}

// absoluteBindSource returns an absolute host path when src is ./ or ../ relative.
func absoluteBindSource(home, src string) (string, bool) {
	src = strings.TrimSpace(src)
	if src == "" || filepath.IsAbs(src) {
		return "", false
	}
	if src != "." && !strings.HasPrefix(src, "./") && !strings.HasPrefix(src, "../") {
		return "", false
	}
	return filepath.Clean(filepath.Join(home, src)), true
}
