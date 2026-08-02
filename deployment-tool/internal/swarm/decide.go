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
