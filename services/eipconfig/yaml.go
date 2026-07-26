package eipconfig

import "gopkg.in/yaml.v3"

func unmarshalYAML(raw []byte, cfg *Config) error {
	return yaml.Unmarshal(raw, cfg)
}
