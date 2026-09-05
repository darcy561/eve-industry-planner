package swarm

import "strings"

// configRollAction is the per-mount decision before Swarm mutations.
type configRollAction int

const (
	configRollSkipMissing configRollAction = iota
	configRollUnchanged
	configRollUpdate
)

func decideConfigRoll(serviceExists bool, liveName, wantObj string) configRollAction {
	if !serviceExists {
		return configRollSkipMissing
	}
	if liveName == wantObj {
		return configRollUnchanged
	}
	return configRollUpdate
}

// staleConfigNames returns eip_-namespaced names outside keep — the objects of keys
// the deployed fragments no longer carry, which supersededObjectNames cannot see
// because it only ever looks within one key.
func staleConfigNames(listed []string, keep map[string]struct{}) []string {
	var out []string
	for _, name := range listed {
		name = strings.TrimSpace(name)
		if name == "" || !strings.HasPrefix(name, "eip_") {
			continue
		}
		if _, ok := keep[name]; ok {
			continue
		}
		out = append(out, name)
	}
	return out
}

// supersededObjectNames returns eip_<key>_* names that are not keep.
func supersededObjectNames(listed []string, key, keep string) []string {
	prefix := "eip_" + key + "_"
	var out []string
	for _, name := range listed {
		name = strings.TrimSpace(name)
		if name == "" || name == keep || !strings.HasPrefix(name, prefix) {
			continue
		}
		out = append(out, name)
	}
	return out
}
