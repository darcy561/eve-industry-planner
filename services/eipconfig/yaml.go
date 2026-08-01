package eipconfig

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

func unmarshalYAML(raw []byte, cfg *Config) error {
	return yaml.Unmarshal(raw, cfg)
}

// WriteYAML validates and writes cfg to path (mode 0600).
func WriteYAML(path string, cfg Config) error {
	if err := cfg.Validate(); err != nil {
		return err
	}
	raw, err := yaml.Marshal(&cfg)
	if err != nil {
		return fmt.Errorf("marshal eip.config: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}
