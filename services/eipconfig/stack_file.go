package eipconfig

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	labelCapacitySync    = "eip.capacity.sync"
	labelCapacityService = "eip.capacity.service"
	labelConfigSync      = "eip.config.sync"
)

// stackFile is the subset of a Compose/stack fragment we need for label discovery.
type stackFile struct {
	Services map[string]stackService `yaml:"services"`
	Configs  map[string]stackConfig  `yaml:"configs"`
}

type stackService struct {
	Image   string             `yaml:"image"`
	Configs []stackConfigMount `yaml:"configs"`
	Secrets stackSecretRefs    `yaml:"secrets"`
	Deploy  stackDeploy        `yaml:"deploy"`
}

// stackSecretRefs is a compose secrets: list (short name or {source: NAME}).
type stackSecretRefs []string

func (s *stackSecretRefs) UnmarshalYAML(value *yaml.Node) error {
	if s == nil {
		return fmt.Errorf("nil stackSecretRefs")
	}
	if value.Kind == yaml.AliasNode && value.Alias != nil {
		value = value.Alias
	}
	if value.Kind == 0 || (value.Kind == yaml.ScalarNode && strings.TrimSpace(value.Value) == "") {
		*s = nil
		return nil
	}
	if value.Kind != yaml.SequenceNode {
		return fmt.Errorf("secrets: want sequence")
	}
	var out []string
	for _, item := range value.Content {
		if item.Kind == yaml.AliasNode && item.Alias != nil {
			item = item.Alias
		}
		switch item.Kind {
		case yaml.ScalarNode:
			k := strings.TrimSpace(item.Value)
			if k != "" {
				out = append(out, k)
			}
		case yaml.MappingNode:
			var mount struct {
				Source string `yaml:"source"`
			}
			if err := item.Decode(&mount); err != nil {
				return err
			}
			k := strings.TrimSpace(mount.Source)
			if k != "" {
				out = append(out, k)
			}
		default:
			return fmt.Errorf("secrets: unsupported entry kind %v", item.Kind)
		}
	}
	*s = out
	return nil
}

type stackDeploy struct {
	Labels stackLabels `yaml:"labels"`
}

type stackConfigMount struct {
	Source string `yaml:"source"`
	Target string `yaml:"target"`
}

type stackConfig struct {
	File string `yaml:"file"`
	Name string `yaml:"name"`
}

// stackLabels accepts list form (- "k=v") or map form (k: v).
type stackLabels map[string]string

func (l *stackLabels) UnmarshalYAML(value *yaml.Node) error {
	if l == nil {
		return fmt.Errorf("nil stackLabels")
	}
	switch value.Kind {
	case yaml.SequenceNode:
		var items []string
		if err := value.Decode(&items); err != nil {
			return err
		}
		m := make(map[string]string, len(items))
		for _, item := range items {
			k, v, ok := strings.Cut(item, "=")
			if !ok || k == "" {
				continue
			}
			m[k] = v
		}
		*l = m
		return nil
	case yaml.MappingNode:
		var m map[string]string
		if err := value.Decode(&m); err != nil {
			return err
		}
		*l = m
		return nil
	case yaml.ScalarNode:
		if strings.TrimSpace(value.Value) == "" {
			*l = stackLabels{}
			return nil
		}
	}
	return fmt.Errorf("deploy.labels: unsupported YAML kind %v", value.Kind)
}

func labelTruthy(v string) bool {
	return v == "1" || v == "true"
}

// LoadStackFile unmarshals a Compose/stack fragment with yaml.v3.
func LoadStackFile(path string) (stackFile, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return stackFile{}, fmt.Errorf("read stack file %s: %w", path, err)
	}
	var sf stackFile
	if err := yaml.Unmarshal(raw, &sf); err != nil {
		return stackFile{}, fmt.Errorf("parse stack file %s: %w", path, err)
	}
	if sf.Services == nil {
		sf.Services = map[string]stackService{}
	}
	if sf.Configs == nil {
		sf.Configs = map[string]stackConfig{}
	}
	return sf, nil
}

// DefaultAppStackFile is the Swarm app fragment used to discover capacity-sync targets.
const DefaultAppStackFile = "docker-stack.yml"

// DefaultDataStackFile is the Swarm data fragment used to discover file-config sync targets.
const DefaultDataStackFile = "docker-stack.data.yml"

// AppStackFile returns EIP_APP_STACK_FILE or DefaultAppStackFile (unresolved).
func AppStackFile() string {
	if v := strings.TrimSpace(os.Getenv("EIP_APP_STACK_FILE")); v != "" {
		return v
	}
	return DefaultAppStackFile
}

// DataStackFile returns EIP_DATA_STACK_FILE or DefaultDataStackFile (unresolved).
func DataStackFile() string {
	if v := strings.TrimSpace(os.Getenv("EIP_DATA_STACK_FILE")); v != "" {
		return v
	}
	return DefaultDataStackFile
}

// ResolveStackPath finds a stack fragment on disk. go run often uses cwd=services/,
// so also try EIP_ROOT and the parent of cwd.
func ResolveStackPath(name string) string {
	if name == "" {
		return name
	}
	if filepath.IsAbs(name) {
		return name
	}
	var candidates []string
	if root := strings.TrimSpace(os.Getenv("EIP_ROOT")); root != "" {
		candidates = append(candidates, filepath.Join(root, name))
	}
	candidates = append(candidates, name, filepath.Join("..", name))
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	return name
}

// ConfigSyncTarget is one managed Swarm file-config mount.
type ConfigSyncTarget struct {
	Key     string // logical configs: source name
	File    string // host path from configs.<key>.file
	Service string // stack service name (no eip_ prefix)
	Target  string // container mount path
}

// ListStackServices returns top-level service names from a stack fragment (sorted).
func ListStackServices(stackPath string) ([]string, error) {
	sf, err := LoadStackFile(stackPath)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(sf.Services))
	for name := range sf.Services {
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

// StackServiceImage returns the raw image: string for a top-level service (may be empty).
func StackServiceImage(stackPath, service string) (string, error) {
	sf, err := LoadStackFile(stackPath)
	if err != nil {
		return "", err
	}
	svc, ok := sf.Services[service]
	if !ok {
		return "", fmt.Errorf("service %q not in %s", service, stackPath)
	}
	return strings.TrimSpace(svc.Image), nil
}

// DiscoverCapacitySyncTargets returns services labeled eip.capacity.sync=1.
// YAMLKey prefers eip.capacity.service when set.
func DiscoverCapacitySyncTargets(stackPath string) ([]ApplyTarget, error) {
	sf, err := LoadStackFile(stackPath)
	if err != nil {
		return nil, err
	}
	var out []ApplyTarget
	names := make([]string, 0, len(sf.Services))
	for name := range sf.Services {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		svc := sf.Services[name]
		if !labelTruthy(svc.Deploy.Labels[labelCapacitySync]) {
			continue
		}
		key := svc.Deploy.Labels[labelCapacityService]
		if key == "" {
			key = name
		}
		out = append(out, ApplyTarget{
			YAMLKey:      key,
			SwarmService: "eip_" + name,
		})
	}
	return out, nil
}

// SecretAttachTarget is one logical secret mount on a stack service.
type SecretAttachTarget struct {
	Service string
	Key     string
}

// DiscoverSecretAttachTargets returns service → secret key pairs from stack YAML secrets:.
func DiscoverSecretAttachTargets(stackPath string) ([]SecretAttachTarget, error) {
	sf, err := LoadStackFile(stackPath)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(sf.Services))
	for name := range sf.Services {
		names = append(names, name)
	}
	sort.Strings(names)
	var out []SecretAttachTarget
	for _, name := range names {
		for _, key := range sf.Services[name].Secrets {
			out = append(out, SecretAttachTarget{Service: name, Key: key})
		}
	}
	return out, nil
}

// DiscoverConfigSyncTargets returns mounts for services labeled eip.config.sync=1.
func DiscoverConfigSyncTargets(stackPath string) ([]ConfigSyncTarget, error) {
	sf, err := LoadStackFile(stackPath)
	if err != nil {
		return nil, err
	}
	var out []ConfigSyncTarget
	names := make([]string, 0, len(sf.Services))
	for name := range sf.Services {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		svc := sf.Services[name]
		if !labelTruthy(svc.Deploy.Labels[labelConfigSync]) {
			continue
		}
		for _, mount := range svc.Configs {
			if mount.Source == "" || mount.Target == "" {
				continue
			}
			cfg, ok := sf.Configs[mount.Source]
			if !ok || strings.TrimSpace(cfg.File) == "" {
				return nil, fmt.Errorf("service %s mounts %s but configs.%s.file is missing in %s", name, mount.Source, mount.Source, stackPath)
			}
			file := strings.TrimPrefix(strings.TrimSpace(cfg.File), "./")
			out = append(out, ConfigSyncTarget{
				Key:     mount.Source,
				File:    file,
				Service: name,
				Target:  mount.Target,
			})
		}
	}
	return out, nil
}
