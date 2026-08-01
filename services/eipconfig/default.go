// DefaultConfig is the Go source of truth for a new eip.config.yaml.
package eipconfig

// DefaultConfig returns starter operator config (kept in sync with
// admintool/internal/kit/templates/yamldefaults.DefaultConfig; no CLI block here).
func DefaultConfig() Config {
	var addons Addons
	addons.Observability.Enabled = false
	return Config{
		Version: 1,
		Addons:  addons,
		Ports: Ports{
			HTTP:             80,
			HTTPS:            443,
			TraefikDashboard: 81,
		},
		Paths: Paths{
			Grafana:          "/grafana",
			TraefikDashboard: "/dashboard",
		},
		Proxy: Proxy{
			TrustedIPs:   []string{},
			TrustedCIDRs: []string{},
		},
		ScaleTiming: ScaleTiming{
			Cooldown:               "2m",
			ScaleUpStabilization:   "1m",
			ScaleDownStabilization: "5m",
		},
		Services: map[string]ServiceSpec{
			"worker": {
				CapacityControllerManaged: true,
				Min:                       1,
				Max:                       2,
				Concurrency:               50,
			},
			"websocket": {
				CapacityControllerManaged: false,
				Min:                       2,
				Max:                       4,
				TargetClients:             1500,
				ClientCutoff:              2000,
				ReserveCapacity:           0.20,
				DrainTimeout:              "10m",
			},
			"api": {
				CapacityControllerManaged: true,
				Min:                       1,
				Max:                       4,
			},
		},
	}
}
