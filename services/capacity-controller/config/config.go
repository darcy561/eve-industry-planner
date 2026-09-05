// Package config holds operator policy YAML for the capacity controller.
// Parses the capacity-relevant fields of eip.config.yaml (scale_timing / services).
// Sync/apply of that file for Swarm stays in the Deployment Tool; this package does not import it.
package config

import (
	"fmt"
	"os"
	"time"

	"go.yaml.in/yaml/v3"
)

// Config is the capacity-relevant slice of eip.config.yaml.
type Config struct {
	ScaleTiming ScaleTiming            `yaml:"scale_timing"`
	Services    map[string]ServiceSpec `yaml:"services"`
}

// ScaleTiming paces Apply decisions.
type ScaleTiming struct {
	Cooldown               Duration `yaml:"cooldown"`
	ScaleUpStabilization   Duration `yaml:"scale_up_stabilization"`
	ScaleDownStabilization Duration `yaml:"scale_down_stabilization"`
}

// ServiceSpec is one services.* block.
type ServiceSpec struct {
	CapacityControllerManaged bool               `yaml:"capacity_controller_managed"`
	Min                       int                `yaml:"min"`
	Max                       int                `yaml:"max"`
	Concurrency               int                `yaml:"concurrency"`
	TargetClients             int                `yaml:"target_clients"`
	ClientCutoff              int                `yaml:"client_cutoff"`
	ReserveCapacity           float64            `yaml:"reserve_capacity"`
	QueueScaleUpPct           map[string]float64 `yaml:"queue_scale_up_pct"` // worker: pending vs slots fraction per priority queue
}

// Duration wraps time.Duration for YAML strings like "2m".
type Duration time.Duration

// UnmarshalYAML parses a Go duration string.
func (d *Duration) UnmarshalYAML(value *yaml.Node) error {
	var s string
	if err := value.Decode(&s); err != nil {
		return err
	}
	parsed, err := time.ParseDuration(s)
	if err != nil {
		return fmt.Errorf("duration: %w", err)
	}
	*d = Duration(parsed)
	return nil
}

// Duration returns the underlying time.Duration.
func (d Duration) Duration() time.Duration { return time.Duration(d) }

// LoadFile reads and validates YAML from path.
func LoadFile(path string) (Config, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	return Load(b)
}

// Load parses and validates YAML bytes.
func Load(b []byte) (Config, error) {
	var cfg Config
	if err := yaml.Unmarshal(b, &cfg); err != nil {
		return Config{}, err
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// Validate fail-closes on missing/invalid capacity services (mirrors Deployment Tool capacity checks).
func (c Config) Validate() error {
	if c.Services == nil {
		return fmt.Errorf("services: required")
	}
	for _, name := range []string{"worker", "websocket", "api"} {
		s, ok := c.Services[name]
		if !ok {
			return fmt.Errorf("services.%s: required", name)
		}
		if s.Min < 1 {
			return fmt.Errorf("services.%s.min: must be >= 1", name)
		}
		if s.Max < s.Min {
			return fmt.Errorf("services.%s.max: must be >= min", name)
		}
	}
	w := c.Services["worker"]
	if w.Concurrency < 1 || w.Concurrency > 50 {
		return fmt.Errorf("services.worker.concurrency: want 1..50, got %d", w.Concurrency)
	}
	if err := validateQueueScaleUpPct(w.QueueScaleUpPct); err != nil {
		return err
	}
	ws := c.Services["websocket"]
	if ws.ClientCutoff < 0 {
		return fmt.Errorf("services.websocket.client_cutoff: must be >= 0")
	}
	if ws.TargetClients < 0 {
		return fmt.Errorf("services.websocket.target_clients: must be >= 0")
	}
	if ws.TargetClients > 0 && ws.ClientCutoff > 0 && ws.TargetClients > ws.ClientCutoff {
		return fmt.Errorf("services.websocket.target_clients: must be <= client_cutoff when both > 0")
	}
	if ws.ReserveCapacity < 0 || ws.ReserveCapacity >= 1 {
		return fmt.Errorf("services.websocket.reserve_capacity: want 0 <= reserve < 1, got %v", ws.ReserveCapacity)
	}
	return nil
}

func validateQueueScaleUpPct(m map[string]float64) error {
	for k, v := range m {
		if v < 0 {
			return fmt.Errorf("services.worker.queue_scale_up_pct.%s: must be >= 0, got %v", k, v)
		}
	}
	return nil
}
