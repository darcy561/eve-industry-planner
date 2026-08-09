// Package yamldefaults is the Go SoT for a new eip.config.yaml (eip init).
// Keep defaults here under kit/templates — do not move into package config.
package yamldefaults

import "eve-industry-planner/deployment-tool/internal/config"

// DefaultConfig returns starter operator config for a new eip.config.yaml.
func DefaultConfig() config.Config {
	var addons config.Addons
	addons.Observability.Enabled = false
	addons.Observability.Grafana.BaseURL = config.DefaultGrafanaBaseURL
	return config.Config{
		Version: 1,
		CLI: config.CLI{
			EnvBackupPath: config.DefaultEnvBackupStem,
		},
		Addons: addons,
		Ports: config.Ports{
			HTTP:             80,
			HTTPS:            443,
			TraefikDashboard: 81,
		},
		Paths: config.Paths{
			Grafana:          "/grafana",
			TraefikDashboard: "/dashboard",
		},
		Proxy: config.Proxy{
			TrustedIPs:   []string{},
			TrustedCIDRs: []string{},
		},
		ScaleTiming: config.ScaleTiming{
			Cooldown:               "2m",
			ScaleUpStabilization:   "1m",
			ScaleDownStabilization: "5m",
		},
		Services: map[string]config.ServiceSpec{
			"worker": {
				CapacityControllerManaged: true,
				Min:                       1,
				Max:                       5,
				Concurrency:               50,
				QueueScaleUpPct: map[string]float64{
					"priority_1": 0.10,
					"priority_2": 0.25,
					"priority_3": 0.50,
					"priority_4": 1.0,
					"priority_5": 2.0,
				},
			},
			"websocket": {
				CapacityControllerManaged: true,
				Min:                       1,
				Max:                       5,
				TargetClients:             1500,
				ClientCutoff:              2000,
				ReserveCapacity:           0.20,
			},
			"api": {
				CapacityControllerManaged: true,
				Min:                       1,
				Max:                       5,
			},
		},
	}
}
