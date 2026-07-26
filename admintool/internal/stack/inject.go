package stack

import (
	"fmt"
	"os"
	"sort"

	"gopkg.in/yaml.v3"
)

// InjectExternalConfigs merges top-level configs: {key: {external:true, name: obj}}
// into an expanded stack file (in place). No-op if keyToObj is empty.
func InjectExternalConfigs(path string, keyToObj map[string]string) error {
	if len(keyToObj) == 0 {
		return nil
	}
	return mutateDoc(path, func(doc *yaml.Node) error {
		setMappingChild(doc, "configs", externalResourceMap(keyToObj))
		return nil
	})
}

// InjectSecrets merges top-level secrets: and per-service secrets: lists into an
// expanded stack file (in place). Replaces any prior secrets lists on matched services.
// Services absent from this fragment are skipped (secrets belong on the app expand).
func InjectSecrets(path string, keyToObj map[string]string, bySvc map[string][]string) error {
	if len(keyToObj) == 0 {
		return nil
	}
	return mutateDoc(path, func(doc *yaml.Node) error {
		setMappingChild(doc, "secrets", externalResourceMap(keyToObj))
		if len(bySvc) == 0 {
			return nil
		}
		services := mappingValue(doc, "services")
		if services == nil || services.Kind != yaml.MappingNode {
			return fmt.Errorf("inject secrets: no services block")
		}
		for svcName, keys := range bySvc {
			if len(keys) == 0 {
				continue
			}
			svc := mappingValue(services, svcName)
			if svc == nil || svc.Kind != yaml.MappingNode {
				continue
			}
			seq := &yaml.Node{Kind: yaml.SequenceNode, Tag: "!!seq"}
			for _, k := range keys {
				seq.Content = append(seq.Content, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: k})
			}
			setMappingChild(svc, "secrets", seq)
		}
		return nil
	})
}

func mutateDoc(path string, fn func(doc *yaml.Node) error) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var root yaml.Node
	if err := yaml.Unmarshal(raw, &root); err != nil {
		return fmt.Errorf("parse %s: %w", path, err)
	}
	if root.Kind != yaml.DocumentNode || len(root.Content) == 0 {
		return fmt.Errorf("inject: empty document in %s", path)
	}
	doc := root.Content[0]
	if doc.Kind != yaml.MappingNode {
		return fmt.Errorf("inject: root not mapping in %s", path)
	}
	if err := fn(doc); err != nil {
		return err
	}
	out, err := yaml.Marshal(&root)
	if err != nil {
		return err
	}
	return os.WriteFile(path, out, 0o600)
}

func externalResourceMap(keyToObj map[string]string) *yaml.Node {
	keys := make([]string, 0, len(keyToObj))
	for k := range keyToObj {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	m := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
	for _, k := range keys {
		entry := &yaml.Node{
			Kind: yaml.MappingNode,
			Tag:  "!!map",
			Content: []*yaml.Node{
				{Kind: yaml.ScalarNode, Tag: "!!str", Value: "external"},
				{Kind: yaml.ScalarNode, Tag: "!!bool", Value: "true"},
				{Kind: yaml.ScalarNode, Tag: "!!str", Value: "name"},
				{Kind: yaml.ScalarNode, Tag: "!!str", Value: keyToObj[k]},
			},
		}
		m.Content = append(m.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: k},
			entry,
		)
	}
	return m
}
