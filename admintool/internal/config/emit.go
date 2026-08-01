package config

import (
	"fmt"

	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/yamlutil"
)

const yamlHeader = `# eip.config.yaml — operator config (written by eip).
# APP_VERSION / secrets live in .env — not here.
# Apply with: eip sync

`

// FormatYAML validates cfg and marshals to YAML bytes with the operator-file header.
func FormatYAML(cfg Config) ([]byte, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	raw, err := yamlutil.Marshal(&cfg)
	if err != nil {
		return nil, fmt.Errorf("marshal eip.config: %w", err)
	}
	out := make([]byte, 0, len(yamlHeader)+len(raw))
	out = append(out, yamlHeader...)
	out = append(out, raw...)
	return out, nil
}

// WriteYAML validates and writes cfg to path (mode 0600).
func WriteYAML(path string, cfg Config) error {
	if err := kit.EnsureFileWritable(path); err != nil {
		return fmt.Errorf("cannot write eip.config.yaml: %w", err)
	}
	raw, err := FormatYAML(cfg)
	if err != nil {
		return err
	}
	return yamlutil.WriteFile(path, raw, 0o600)
}
