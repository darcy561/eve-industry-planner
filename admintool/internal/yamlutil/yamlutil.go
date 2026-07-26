// Package yamlutil is shared YAML load/alias helpers for admintool.
package yamlutil

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Resolve follows a YAML alias to its target node (or returns n unchanged).
func Resolve(n yaml.Node) yaml.Node {
	if n.Kind == yaml.AliasNode && n.Alias != nil {
		return *n.Alias
	}
	return n
}

// ResolvePtr follows a YAML alias pointer.
func ResolvePtr(n *yaml.Node) *yaml.Node {
	if n == nil {
		return nil
	}
	if n.Kind == yaml.AliasNode && n.Alias != nil {
		return n.Alias
	}
	return n
}

// UnmarshalFile reads path and unmarshals into v.
func UnmarshalFile(path string, v any) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := yaml.Unmarshal(raw, v); err != nil {
		return fmt.Errorf("parse %s: %w", path, err)
	}
	return nil
}
