// Package yamldefaults — ConfigFields is the TUI/edit SoT for eip.config.yaml knobs.
// Defaults stay in DefaultConfig(); live Validate/WriteYAML stay in package config.
package yamldefaults

import (
	"fmt"
	"strconv"
	"strings"

	"eve-industry-planner/deployment-tool/internal/config"
)

// FieldType selects how a ConfigField value is parsed from the builder string map.
type FieldType int

const (
	FieldText FieldType = iota
	FieldBool
	FieldInt
	FieldFloat
	FieldStringList // comma-separated (proxy.trusted_ips / trusted_cidrs)
)

// ConfigField is one operator-editable eip.config.yaml knob.
type ConfigField struct {
	Key     string // dotted path, e.g. "ports.http", "services.worker.min"
	Section string
	Label   string
	Help    string
	Type    FieldType
}

// ConfigFields returns the registry in section/display order.
// cli.env_backup_path is owned by the env builder Operator section (Setup writes it first).
func ConfigFields() []ConfigField {
	return []ConfigField{
		{
			Key: "addons.observability.enabled", Section: "Addons", Label: "Observability",
			Help: "Enable Prometheus/Grafana/Loki observability stack (eip sync applies).",
			Type: FieldBool,
		},
		{
			Key: "ports.http", Section: "Ports", Label: "HTTP port",
			Help: "Host publish port for HTTP (0 or empty → 80).",
			Type: FieldInt,
		},
		{
			Key: "ports.https", Section: "Ports", Label: "HTTPS port",
			Help: "Host publish port for HTTPS (0 or empty → 443).",
			Type: FieldInt,
		},
		{
			Key: "ports.traefik_dashboard", Section: "Ports", Label: "Traefik dashboard port",
			Help: "Host publish port for Traefik dashboard (0 or empty → 81).",
			Type: FieldInt,
		},
		{
			Key: "paths.grafana", Section: "Paths", Label: "Grafana path",
			Help: "URL path prefix for Grafana (must start with /).",
			Type: FieldText,
		},
		{
			Key: "paths.traefik_dashboard", Section: "Paths", Label: "Traefik dashboard path",
			Help: "URL path prefix for Traefik dashboard (must start with /).",
			Type: FieldText,
		},
		{
			Key: "proxy.trusted_ips", Section: "Proxy", Label: "Trusted IPs",
			Help: "Comma-separated bare IPs for Traefik forwardedHeaders (not CIDRs).",
			Type: FieldStringList,
		},
		{
			Key: "proxy.trusted_cidrs", Section: "Proxy", Label: "Trusted CIDRs",
			Help: "Comma-separated CIDRs for Traefik forwardedHeaders (not bare IPs).",
			Type: FieldStringList,
		},
		{
			Key: "scale_timing.cooldown", Section: "Scale timing", Label: "Cooldown",
			Help: "Capacity controller cooldown duration (e.g. 2m).",
			Type: FieldText,
		},
		{
			Key: "scale_timing.scale_up_stabilization", Section: "Scale timing", Label: "Scale-up stabilization",
			Help: "Stabilization window before scaling up (e.g. 1m).",
			Type: FieldText,
		},
		{
			Key: "scale_timing.scale_down_stabilization", Section: "Scale timing", Label: "Scale-down stabilization",
			Help: "Stabilization window before scaling down (e.g. 5m).",
			Type: FieldText,
		},
		{
			Key: "services.worker.capacity_controller_managed", Section: "Worker", Label: "Capacity managed",
			Help: "When true, capacity controller may adjust worker replicas within min/max.",
			Type: FieldBool,
		},
		{
			Key: "services.worker.min", Section: "Worker", Label: "Min replicas",
			Help: "Minimum worker replicas (>= 1).",
			Type: FieldInt,
		},
		{
			Key: "services.worker.max", Section: "Worker", Label: "Max replicas",
			Help: "Maximum worker replicas (>= min).",
			Type: FieldInt,
		},
		{
			Key: "services.worker.concurrency", Section: "Worker", Label: "Concurrency",
			Help: "Jobs per worker replica (1..50).",
			Type: FieldInt,
		},
		{
			Key: "services.websocket.capacity_controller_managed", Section: "Websocket", Label: "Capacity managed",
			Help: "When true, capacity controller may adjust websocket replicas within min/max.",
			Type: FieldBool,
		},
		{
			Key: "services.websocket.min", Section: "Websocket", Label: "Min replicas",
			Help: "Minimum websocket replicas (>= 1).",
			Type: FieldInt,
		},
		{
			Key: "services.websocket.max", Section: "Websocket", Label: "Max replicas",
			Help: "Maximum websocket replicas (>= min).",
			Type: FieldInt,
		},
		{
			Key: "services.websocket.target_clients", Section: "Websocket", Label: "Target clients",
			Help: "Target concurrent clients per capacity planning.",
			Type: FieldInt,
		},
		{
			Key: "services.websocket.client_cutoff", Section: "Websocket", Label: "Client cutoff",
			Help: "Hard client cutoff (0 = unlimited).",
			Type: FieldInt,
		},
		{
			Key: "services.websocket.reserve_capacity", Section: "Websocket", Label: "Reserve capacity",
			Help: "Fraction of capacity held in reserve (e.g. 0.20).",
			Type: FieldFloat,
		},
		{
			Key: "services.websocket.drain_timeout", Section: "Websocket", Label: "Drain timeout",
			Help: "Drain timeout when scaling down (e.g. 10m).",
			Type: FieldText,
		},
		{
			Key: "services.api.capacity_controller_managed", Section: "API", Label: "Capacity managed",
			Help: "When true, capacity controller may adjust API replicas within min/max.",
			Type: FieldBool,
		},
		{
			Key: "services.api.min", Section: "API", Label: "Min replicas",
			Help: "Minimum API replicas (>= 1).",
			Type: FieldInt,
		},
		{
			Key: "services.api.max", Section: "API", Label: "Max replicas",
			Help: "Maximum API replicas (>= min).",
			Type: FieldInt,
		},
	}
}

// ValuesFromConfig flattens cfg into ConfigField keys (string form for the builder).
func ValuesFromConfig(cfg config.Config) map[string]string {
	out := make(map[string]string, len(ConfigFields()))
	for _, f := range ConfigFields() {
		out[f.Key] = getFieldString(cfg, f)
	}
	return out
}

// ApplyToConfig copies DefaultConfig, preserves CLI (incl. env backup path), then
// applies values for ConfigFields. Returns Validate error from config.
func ApplyToConfig(base config.Config, values map[string]string) (config.Config, error) {
	cfg := base
	if cfg.Services == nil {
		cfg.Services = map[string]config.ServiceSpec{}
	}
	ensureService := func(name string) config.ServiceSpec {
		if s, ok := cfg.Services[name]; ok {
			return s
		}
		return config.ServiceSpec{}
	}
	for _, f := range ConfigFields() {
		raw, ok := values[f.Key]
		if !ok {
			continue
		}
		if err := setField(&cfg, f, raw, ensureService); err != nil {
			return config.Config{}, fmt.Errorf("%s: %w", f.Key, err)
		}
	}
	if err := cfg.Validate(); err != nil {
		return config.Config{}, err
	}
	return cfg, nil
}

// WriteDefaultsPreservingCLI writes DefaultConfig with CLI taken from preserve
// (Setup “use defaults” after env Persist already set env_backup_path).
func WriteDefaultsPreservingCLI(path string, preserve config.CLI) error {
	cfg := DefaultConfig()
	cfg.CLI = preserve
	return config.WriteYAML(path, cfg)
}

func getFieldString(cfg config.Config, f ConfigField) string {
	switch f.Key {
	case "addons.observability.enabled":
		return strconv.FormatBool(cfg.Addons.Observability.Enabled)
	case "ports.http":
		return strconv.Itoa(cfg.Ports.HTTP)
	case "ports.https":
		return strconv.Itoa(cfg.Ports.HTTPS)
	case "ports.traefik_dashboard":
		return strconv.Itoa(cfg.Ports.TraefikDashboard)
	case "paths.grafana":
		return cfg.Paths.Grafana
	case "paths.traefik_dashboard":
		return cfg.Paths.TraefikDashboard
	case "proxy.trusted_ips":
		return strings.Join(cfg.Proxy.TrustedIPs, ", ")
	case "proxy.trusted_cidrs":
		return strings.Join(cfg.Proxy.TrustedCIDRs, ", ")
	case "scale_timing.cooldown":
		return cfg.ScaleTiming.Cooldown
	case "scale_timing.scale_up_stabilization":
		return cfg.ScaleTiming.ScaleUpStabilization
	case "scale_timing.scale_down_stabilization":
		return cfg.ScaleTiming.ScaleDownStabilization
	case "services.worker.capacity_controller_managed":
		return strconv.FormatBool(cfg.Services["worker"].CapacityControllerManaged)
	case "services.worker.min":
		return strconv.Itoa(cfg.Services["worker"].Min)
	case "services.worker.max":
		return strconv.Itoa(cfg.Services["worker"].Max)
	case "services.worker.concurrency":
		return strconv.Itoa(cfg.Services["worker"].Concurrency)
	case "services.websocket.capacity_controller_managed":
		return strconv.FormatBool(cfg.Services["websocket"].CapacityControllerManaged)
	case "services.websocket.min":
		return strconv.Itoa(cfg.Services["websocket"].Min)
	case "services.websocket.max":
		return strconv.Itoa(cfg.Services["websocket"].Max)
	case "services.websocket.target_clients":
		return strconv.Itoa(cfg.Services["websocket"].TargetClients)
	case "services.websocket.client_cutoff":
		return strconv.Itoa(cfg.Services["websocket"].ClientCutoff)
	case "services.websocket.reserve_capacity":
		return strconv.FormatFloat(cfg.Services["websocket"].ReserveCapacity, 'f', -1, 64)
	case "services.websocket.drain_timeout":
		return cfg.Services["websocket"].DrainTimeout
	case "services.api.capacity_controller_managed":
		return strconv.FormatBool(cfg.Services["api"].CapacityControllerManaged)
	case "services.api.min":
		return strconv.Itoa(cfg.Services["api"].Min)
	case "services.api.max":
		return strconv.Itoa(cfg.Services["api"].Max)
	default:
		return ""
	}
}

func setField(cfg *config.Config, f ConfigField, raw string, ensure func(string) config.ServiceSpec) error {
	raw = strings.TrimSpace(raw)
	switch f.Key {
	case "addons.observability.enabled":
		b, err := parseBool(raw)
		if err != nil {
			return err
		}
		cfg.Addons.Observability.Enabled = b
	case "ports.http":
		n, err := parseInt(raw)
		if err != nil {
			return err
		}
		cfg.Ports.HTTP = n
	case "ports.https":
		n, err := parseInt(raw)
		if err != nil {
			return err
		}
		cfg.Ports.HTTPS = n
	case "ports.traefik_dashboard":
		n, err := parseInt(raw)
		if err != nil {
			return err
		}
		cfg.Ports.TraefikDashboard = n
	case "paths.grafana":
		cfg.Paths.Grafana = raw
	case "paths.traefik_dashboard":
		cfg.Paths.TraefikDashboard = raw
	case "proxy.trusted_ips":
		cfg.Proxy.TrustedIPs = parseStringList(raw)
	case "proxy.trusted_cidrs":
		cfg.Proxy.TrustedCIDRs = parseStringList(raw)
	case "scale_timing.cooldown":
		cfg.ScaleTiming.Cooldown = raw
	case "scale_timing.scale_up_stabilization":
		cfg.ScaleTiming.ScaleUpStabilization = raw
	case "scale_timing.scale_down_stabilization":
		cfg.ScaleTiming.ScaleDownStabilization = raw
	case "services.worker.capacity_controller_managed":
		b, err := parseBool(raw)
		if err != nil {
			return err
		}
		s := ensure("worker")
		s.CapacityControllerManaged = b
		cfg.Services["worker"] = s
	case "services.worker.min":
		n, err := parseInt(raw)
		if err != nil {
			return err
		}
		s := ensure("worker")
		s.Min = n
		cfg.Services["worker"] = s
	case "services.worker.max":
		n, err := parseInt(raw)
		if err != nil {
			return err
		}
		s := ensure("worker")
		s.Max = n
		cfg.Services["worker"] = s
	case "services.worker.concurrency":
		n, err := parseInt(raw)
		if err != nil {
			return err
		}
		s := ensure("worker")
		s.Concurrency = n
		cfg.Services["worker"] = s
	case "services.websocket.capacity_controller_managed":
		b, err := parseBool(raw)
		if err != nil {
			return err
		}
		s := ensure("websocket")
		s.CapacityControllerManaged = b
		cfg.Services["websocket"] = s
	case "services.websocket.min":
		n, err := parseInt(raw)
		if err != nil {
			return err
		}
		s := ensure("websocket")
		s.Min = n
		cfg.Services["websocket"] = s
	case "services.websocket.max":
		n, err := parseInt(raw)
		if err != nil {
			return err
		}
		s := ensure("websocket")
		s.Max = n
		cfg.Services["websocket"] = s
	case "services.websocket.target_clients":
		n, err := parseInt(raw)
		if err != nil {
			return err
		}
		s := ensure("websocket")
		s.TargetClients = n
		cfg.Services["websocket"] = s
	case "services.websocket.client_cutoff":
		n, err := parseInt(raw)
		if err != nil {
			return err
		}
		s := ensure("websocket")
		s.ClientCutoff = n
		cfg.Services["websocket"] = s
	case "services.websocket.reserve_capacity":
		n, err := parseFloat(raw)
		if err != nil {
			return err
		}
		s := ensure("websocket")
		s.ReserveCapacity = n
		cfg.Services["websocket"] = s
	case "services.websocket.drain_timeout":
		s := ensure("websocket")
		s.DrainTimeout = raw
		cfg.Services["websocket"] = s
	case "services.api.capacity_controller_managed":
		b, err := parseBool(raw)
		if err != nil {
			return err
		}
		s := ensure("api")
		s.CapacityControllerManaged = b
		cfg.Services["api"] = s
	case "services.api.min":
		n, err := parseInt(raw)
		if err != nil {
			return err
		}
		s := ensure("api")
		s.Min = n
		cfg.Services["api"] = s
	case "services.api.max":
		n, err := parseInt(raw)
		if err != nil {
			return err
		}
		s := ensure("api")
		s.Max = n
		cfg.Services["api"] = s
	default:
		return fmt.Errorf("unknown config field")
	}
	return nil
}

func parseBool(raw string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "true", "1", "yes", "on":
		return true, nil
	case "false", "0", "no", "off", "":
		return false, nil
	default:
		return false, fmt.Errorf("want true/false, got %q", raw)
	}
}

func parseInt(raw string) (int, error) {
	if strings.TrimSpace(raw) == "" {
		return 0, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("want integer, got %q", raw)
	}
	return n, nil
}

func parseFloat(raw string) (float64, error) {
	if strings.TrimSpace(raw) == "" {
		return 0, nil
	}
	n, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("want number, got %q", raw)
	}
	return n, nil
}

func parseStringList(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
