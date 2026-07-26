// Package stack loads docker-stack*.yml fragments and expands them for deploy.
// Membership SoT for capacity sync, config mounts, secret attaches, and Traefik/Grafana apply.
package stack

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"

	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/yamlutil"
)

// Deploy label keys (stack YAML SoT).
const (
	LabelConfigSync      = "eip.config.sync"
	LabelCapacitySync    = "eip.capacity.sync"
	LabelCapacityService = "eip.capacity.service"
	LabelCapacityMin     = "eip.capacity.min"
	LabelCapacityMax     = "eip.capacity.max"
)

// Doc is a stack fragment subset used by admintool.
type Doc struct {
	Services map[string]Service    `yaml:"services"`
	Networks map[string]Network    `yaml:"networks"`
	Volumes  map[string]Volume     `yaml:"volumes"`
	Configs  map[string]FileConfig `yaml:"configs"`
}

// Service is a top-level services.* entry.
type Service struct {
	Image       string        `yaml:"image"`
	Deploy      Deploy        `yaml:"deploy"`
	Configs     []ConfigRef   `yaml:"configs"`
	Secrets     SecretRefs    `yaml:"secrets"`
	Ports       []PortPublish `yaml:"ports"`
	Environment ServiceEnv    `yaml:"environment"`
}

// PortPublish is a long-form services.*.ports entry (target/published).
type PortPublish struct {
	Target    int                  `yaml:"target"`
	Published PortPublishPublished `yaml:"published"` // "${EIP_HTTP_PORT:-80}" or bare number
	Protocol  string               `yaml:"protocol"`
	Mode      string               `yaml:"mode"`
}

// ServiceEnv is services.*.environment (map form or KEY=VALUE list).
type ServiceEnv map[string]string

// UnmarshalYAML implements yaml.Unmarshaler.
func (e *ServiceEnv) UnmarshalYAML(value *yaml.Node) error {
	if e == nil {
		return fmt.Errorf("nil ServiceEnv")
	}
	value = yamlutil.ResolvePtr(value)
	if value == nil {
		*e = ServiceEnv{}
		return nil
	}
	switch value.Kind {
	case yaml.MappingNode:
		var m map[string]string
		if err := value.Decode(&m); err != nil {
			return err
		}
		*e = m
		return nil
	case yaml.SequenceNode:
		var items []string
		if err := value.Decode(&items); err != nil {
			return err
		}
		m := make(ServiceEnv, len(items))
		for _, item := range items {
			k, v, ok := strings.Cut(item, "=")
			if !ok || k == "" {
				continue
			}
			m[k] = v
		}
		*e = m
		return nil
	case yaml.ScalarNode:
		if strings.TrimSpace(value.Value) == "" {
			*e = ServiceEnv{}
			return nil
		}
	}
	return fmt.Errorf("environment: unsupported YAML kind %v", value.Kind)
}

// PortPublishPublished accepts a YAML string or number for published:.
type PortPublishPublished string

// UnmarshalYAML implements yaml.Unmarshaler.
func (p *PortPublishPublished) UnmarshalYAML(value *yaml.Node) error {
	value = yamlutil.ResolvePtr(value)
	if value == nil {
		*p = ""
		return nil
	}
	if value.Kind != yaml.ScalarNode {
		return fmt.Errorf("ports.published: want scalar, got kind %v", value.Kind)
	}
	*p = PortPublishPublished(strings.TrimSpace(value.Value))
	return nil
}

// TraefikPublishPort is one Traefik host-publish mapping from stack YAML.
type TraefikPublishPort struct {
	Target    int
	Protocol  string // e.g. tcp
	Mode      string // e.g. ingress
	Published string // raw published template
}

// TraefikApplySurface is Traefik port + dashboard rule SoT from docker-stack.yml.
type TraefikApplySurface struct {
	HTTP             TraefikPublishPort
	HTTPS            TraefikPublishPort
	Dashboard        TraefikPublishPort
	DashboardRule    string // raw label value with ${EIP_TRAEFIK_DASHBOARD_PATH:-…}
	DashboardRuleKey string
}

const (
	traefikDashboardRuleLabelKey = "traefik.http.routers.traefik-dashboard.rule"
	envTraefikDashboardPath      = "EIP_TRAEFIK_DASHBOARD_PATH"
)

// TraefikApplySurfaceFromDoc reads services.traefik ports + dashboard rule from the
func TraefikApplySurfaceFromDoc(doc Doc) (TraefikApplySurface, error) {
	svc, ok := doc.Services["traefik"]
	if !ok {
		return TraefikApplySurface{}, fmt.Errorf("stack has no traefik service")
	}
	var out TraefikApplySurface
	var sawHTTP, sawHTTPS, sawDash bool
	for _, p := range svc.Ports {
		if p.Target < 1 {
			continue
		}
		port := TraefikPublishPort{
			Target:    p.Target,
			Protocol:  strings.TrimSpace(p.Protocol),
			Mode:      strings.TrimSpace(p.Mode),
			Published: string(p.Published),
		}
		if port.Protocol == "" {
			port.Protocol = "tcp"
		}
		if port.Mode == "" {
			port.Mode = "ingress"
		}
		pub := port.Published
		switch {
		case strings.Contains(pub, "EIP_HTTP_PORT"):
			out.HTTP = port
			sawHTTP = true
		case strings.Contains(pub, "EIP_HTTPS_PORT"):
			out.HTTPS = port
			sawHTTPS = true
		case strings.Contains(pub, "EIP_TRAEFIK_DASHBOARD_PORT"):
			out.Dashboard = port
			sawDash = true
		}
	}
	if !sawHTTP || !sawHTTPS || !sawDash {
		return TraefikApplySurface{}, fmt.Errorf("traefik ports: need published ${EIP_HTTP_PORT}, ${EIP_HTTPS_PORT}, ${EIP_TRAEFIK_DASHBOARD_PORT} (got http=%v https=%v dash=%v)", sawHTTP, sawHTTPS, sawDash)
	}
	rule := LabelValue(svc, traefikDashboardRuleLabelKey)
	if rule == "" || !strings.Contains(rule, envTraefikDashboardPath) {
		return TraefikApplySurface{}, fmt.Errorf("traefik: missing deploy label %s with ${%s}", traefikDashboardRuleLabelKey, envTraefikDashboardPath)
	}
	out.DashboardRule = rule
	out.DashboardRuleKey = traefikDashboardRuleLabelKey
	return out, nil
}

// GrafanaApplySurface is path apply SoT from docker-stack.obs.yml.
type GrafanaApplySurface struct {
	Service        string // stack short name
	RootURLEnv     string // GF_SERVER_ROOT_URL
	RootURLTmpl    string // ${GRAFANA_ROOT_URL:-http://…}
	TraefikRuleKey string
	TraefikRule    string // PathPrefix(`${EIP_GRAFANA_PATH:-…}`)
}

const (
	envGrafanaPath    = "EIP_GRAFANA_PATH"
	envGrafanaRoot    = "GRAFANA_ROOT_URL"
	grafanaRootURLEnv = "GF_SERVER_ROOT_URL"
)

// GrafanaApplySurfaceFromDoc reads services.grafana path templates from the obs
func GrafanaApplySurfaceFromDoc(doc Doc) (GrafanaApplySurface, error) {
	svc, ok := doc.Services["grafana"]
	if !ok {
		return GrafanaApplySurface{}, fmt.Errorf("stack has no grafana service")
	}
	rootTmpl := strings.TrimSpace(svc.Environment[grafanaRootURLEnv])
	if rootTmpl == "" || !strings.Contains(rootTmpl, envGrafanaRoot) {
		return GrafanaApplySurface{}, fmt.Errorf("grafana: missing environment %s with ${%s}", grafanaRootURLEnv, envGrafanaRoot)
	}
	var ruleKey, rule string
	for k, v := range svc.Deploy.Labels {
		if strings.Contains(v, envGrafanaPath) && strings.Contains(k, "grafana.rule") {
			ruleKey, rule = k, v
			break
		}
	}
	if rule == "" {
		return GrafanaApplySurface{}, fmt.Errorf("grafana: missing Traefik rule label with ${%s}", envGrafanaPath)
	}
	return GrafanaApplySurface{
		Service:        "grafana",
		RootURLEnv:     grafanaRootURLEnv,
		RootURLTmpl:    rootTmpl,
		TraefikRuleKey: ruleKey,
		TraefikRule:    rule,
	}, nil
}

// DesiredGrafanaRootURL builds GF_SERVER_ROOT_URL for path using the stack default template.
func DesiredGrafanaRootURL(surface GrafanaApplySurface, pathPrefix string) string {
	pathPrefix = strings.TrimSpace(pathPrefix)
	if pathPrefix == "" {
		pathPrefix = EnvDefault(surface.TraefikRule, envGrafanaPath)
		if pathPrefix == "" {
			pathPrefix = "/grafana"
		}
	}
	def := EnvDefault(surface.RootURLTmpl, envGrafanaRoot)
	if def == "" {
		return "http://127.0.0.1" + pathPrefix + "/"
	}
	oldPath := EnvDefault(surface.TraefikRule, envGrafanaPath)
	if oldPath == "" {
		oldPath = "/grafana"
	}
	if strings.Contains(def, oldPath) {
		return strings.Replace(def, oldPath, pathPrefix, 1)
	}
	return "http://127.0.0.1" + pathPrefix + "/"
}

// HasEnvironmentKey reports whether service declares env key (map key present).
func HasEnvironmentKey(svc Service, key string) bool {
	if svc.Environment == nil {
		return false
	}
	_, ok := svc.Environment[key]
	return ok
}

// Capacity-sync env keys (applied only when the stack service declares them).
const (
	EnvWSSlotClientCutoff     = "WS_SLOT_CLIENT_CUTOFF"
	EnvWorkerAsynqConcurrency = "WORKER_ASYNQ_CONCURRENCY"
)

// Deploy holds deploy.* fields we read.
type Deploy struct {
	Labels Labels `yaml:"labels"`
}

// ConfigRef is a service configs: mount.
type ConfigRef struct {
	Source string `yaml:"source"`
	Target string `yaml:"target"`
}

// FileConfig is a top-level configs.* entry.
type FileConfig struct {
	File string `yaml:"file"`
}

// Network is a top-level networks.* entry.
type Network struct {
	Name     string       `yaml:"name"`
	External ExternalFlag `yaml:"external"`
}

// Volume is a top-level volumes.* entry.
type Volume struct {
	Name     string       `yaml:"name"`
	External ExternalFlag `yaml:"external"`
}

// ConfigMount is one eip.config.sync file mount on a service.
type ConfigMount struct {
	Key     string // logical configs: source name
	File    string // relative to project home
	Service string // stack service name (no stack prefix)
	Target  string // container mount path
}

// CapacityTarget maps operator YAML key → Swarm service name.
type CapacityTarget struct {
	YAMLKey      string // services.<key> in eip.config.yaml
	SwarmService string // e.g. eip_api
	Service      string // stack service short name
}

// SecretAttach is one service → logical secret key.
type SecretAttach struct {
	Service string
	Key     string
}

// Labels accepts list form (- "k=v") or map form (k: v).
type Labels map[string]string

// UnmarshalYAML implements yaml.Unmarshaler.
func (l *Labels) UnmarshalYAML(value *yaml.Node) error {
	if l == nil {
		return fmt.Errorf("nil Labels")
	}
	value = yamlutil.ResolvePtr(value)
	if value == nil {
		*l = Labels{}
		return nil
	}
	switch value.Kind {
	case yaml.SequenceNode:
		var items []string
		if err := value.Decode(&items); err != nil {
			return err
		}
		m := make(Labels, len(items))
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
			*l = Labels{}
			return nil
		}
	}
	return fmt.Errorf("deploy.labels: unsupported YAML kind %v", value.Kind)
}

// SecretRefs is services.*.secrets (short `- KEY` or long `source:`).
type SecretRefs []string

// UnmarshalYAML implements yaml.Unmarshaler.
func (s *SecretRefs) UnmarshalYAML(value *yaml.Node) error {
	if value == nil {
		*s = nil
		return nil
	}
	n := yamlutil.Resolve(*value)
	if n.Kind == 0 || (n.Kind == yaml.ScalarNode && strings.TrimSpace(n.Value) == "") {
		*s = nil
		return nil
	}
	if n.Kind != yaml.SequenceNode {
		return fmt.Errorf("secrets: want sequence, got kind %v", n.Kind)
	}
	var keys []string
	for _, item := range n.Content {
		node := yamlutil.Resolve(*item)
		switch node.Kind {
		case yaml.ScalarNode:
			k := strings.TrimSpace(node.Value)
			if k != "" {
				keys = append(keys, k)
			}
		case yaml.MappingNode:
			var mount struct {
				Source string `yaml:"source"`
			}
			if err := node.Decode(&mount); err != nil {
				return err
			}
			k := strings.TrimSpace(mount.Source)
			if k != "" {
				keys = append(keys, k)
			}
		default:
			return fmt.Errorf("secrets: unsupported entry kind %v", node.Kind)
		}
	}
	*s = keys
	return nil
}

// ExternalFlag accepts compose forms: true | "true" | { name: ... }.
type ExternalFlag bool

// UnmarshalYAML implements yaml.Unmarshaler.
func (e *ExternalFlag) UnmarshalYAML(value *yaml.Node) error {
	if value == nil {
		*e = false
		return nil
	}
	value = yamlutil.ResolvePtr(value)
	if value == nil {
		*e = false
		return nil
	}
	switch value.Kind {
	case yaml.ScalarNode:
		*e = ExternalFlag(kit.Truthy(value.Value))
		return nil
	case yaml.MappingNode:
		*e = true
		return nil
	default:
		*e = false
		return nil
	}
}

// Load reads and unmarshals a stack fragment.
func Load(path string) (Doc, error) {
	var doc Doc
	if err := yamlutil.UnmarshalFile(path, &doc); err != nil {
		return Doc{}, err
	}
	if doc.Services == nil {
		doc.Services = map[string]Service{}
	}
	if doc.Networks == nil {
		doc.Networks = map[string]Network{}
	}
	if doc.Volumes == nil {
		doc.Volumes = map[string]Volume{}
	}
	if doc.Configs == nil {
		doc.Configs = map[string]FileConfig{}
	}
	return doc, nil
}

// LoadAll loads fragments under home (relative or absolute paths) in order.
func LoadAll(home string, relPaths ...string) ([]Doc, error) {
	out := make([]Doc, 0, len(relPaths))
	for _, rel := range relPaths {
		path := rel
		if !filepath.IsAbs(path) {
			path = filepath.Join(home, rel)
		}
		doc, err := Load(path)
		if err != nil {
			return nil, err
		}
		out = append(out, doc)
	}
	return out, nil
}

// ResourceName returns the Swarm/Compose resource name (explicit name: or map key).
func ResourceName(key, explicit string) string {
	if s := strings.TrimSpace(explicit); s != "" {
		return s
	}
	return key
}

// ExternalNetworks returns unique external network names across fragments.
func ExternalNetworks(docs ...Doc) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, doc := range docs {
		for key, net := range doc.Networks {
			if !net.External {
				continue
			}
			name := ResourceName(key, net.Name)
			if _, ok := seen[name]; ok {
				continue
			}
			seen[name] = struct{}{}
			out = append(out, name)
		}
	}
	return out
}

// ExternalVolumes returns unique external volume names across fragments.
func ExternalVolumes(docs ...Doc) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, doc := range docs {
		for key, vol := range doc.Volumes {
			if !vol.External {
				continue
			}
			name := ResourceName(key, vol.Name)
			if _, ok := seen[name]; ok {
				continue
			}
			seen[name] = struct{}{}
			out = append(out, name)
		}
	}
	return out
}

// ImageRepos returns service → image repository (tag stripped).
func ImageRepos(doc Doc) map[string]string {
	out := map[string]string{}
	for name, svc := range doc.Services {
		img := strings.TrimSpace(svc.Image)
		if img == "" {
			continue
		}
		repo, _, _ := strings.Cut(img, ":")
		if repo == "" {
			continue
		}
		out[name] = repo
	}
	return out
}

// ConfigMounts returns every eip.config.sync mount (stable service order).
// Same logical key on two services yields two entries (mount roll needs both).
func ConfigMounts(doc Doc) ([]ConfigMount, error) {
	names := sortedKeys(doc.Services)
	var out []ConfigMount
	for _, name := range names {
		svc := doc.Services[name]
		if !kit.Truthy(svc.Deploy.Labels[LabelConfigSync]) {
			continue
		}
		for _, mount := range svc.Configs {
			if mount.Source == "" || mount.Target == "" {
				continue
			}
			cfg, ok := doc.Configs[mount.Source]
			if !ok || strings.TrimSpace(cfg.File) == "" {
				return nil, fmt.Errorf("service %s mounts %s but configs.%s.file is missing", name, mount.Source, mount.Source)
			}
			file := strings.TrimPrefix(strings.TrimSpace(cfg.File), "./")
			out = append(out, ConfigMount{
				Key:     mount.Source,
				File:    file,
				Service: name,
				Target:  mount.Target,
			})
		}
	}
	return out, nil
}

// ConfigSyncTargets returns unique key→file pairs for Swarm config object sync.
func ConfigSyncTargets(doc Doc) ([]ConfigMount, error) {
	mounts, err := ConfigMounts(doc)
	if err != nil {
		return nil, err
	}
	var out []ConfigMount
	seen := map[string]struct{}{}
	for _, m := range mounts {
		if _, ok := seen[m.Key]; ok {
			continue
		}
		seen[m.Key] = struct{}{}
		out = append(out, ConfigMount{Key: m.Key, File: m.File})
	}
	return out, nil
}

// CapacityTargets returns services with eip.capacity.sync=1 (stable order).
// YAMLKey prefers eip.capacity.service when set. SwarmService uses stackPrefix
// (default "eip") + "_" + short name.
func CapacityTargets(doc Doc, stackPrefix string) []CapacityTarget {
	if stackPrefix == "" {
		stackPrefix = "eip"
	}
	names := sortedKeys(doc.Services)
	var out []CapacityTarget
	for _, name := range names {
		svc := doc.Services[name]
		if !kit.Truthy(svc.Deploy.Labels[LabelCapacitySync]) {
			continue
		}
		key := strings.TrimSpace(svc.Deploy.Labels[LabelCapacityService])
		if key == "" {
			key = name
		}
		out = append(out, CapacityTarget{
			YAMLKey:      key,
			SwarmService: stackPrefix + "_" + name,
			Service:      name,
		})
	}
	return out
}

// SecretAttaches returns per-service secret keys (stable service order).
func SecretAttaches(doc Doc) []SecretAttach {
	names := sortedKeys(doc.Services)
	var out []SecretAttach
	for _, name := range names {
		for _, k := range doc.Services[name].Secrets {
			out = append(out, SecretAttach{Service: name, Key: k})
		}
	}
	return out
}

func sortedKeys[V any](m map[string]V) []string {
	names := make([]string, 0, len(m))
	for n := range m {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}
