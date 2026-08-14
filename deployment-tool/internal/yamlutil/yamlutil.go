// Package yamlutil is shared YAML helpers for deployment-tool (stack docs + operator config).
// Domain validate/headers stay in callers (e.g. package config); this package is IO + node utils.
package yamlutil

import (
	"fmt"
	"os"
	"path/filepath"

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

// Marshal encodes v as YAML.
func Marshal(v any) ([]byte, error) {
	return yaml.Marshal(v)
}

// WriteFile creates parent dirs and writes raw bytes (mode perm).
func WriteFile(path string, raw []byte, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(path, raw, perm); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}
