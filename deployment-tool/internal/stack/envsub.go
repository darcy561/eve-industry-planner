package stack

import (
	"regexp"
	"strings"
)

// ${NAME} or ${NAME:-default}
var envDefaultRe = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}`)

// SubstituteEnv replaces ${KEY} / ${KEY:-default} occurrences of envKey with value.
func SubstituteEnv(template, envKey, value string) string {
	return envDefaultRe.ReplaceAllStringFunc(template, func(m string) string {
		sub := envDefaultRe.FindStringSubmatch(m)
		if len(sub) < 2 || sub[1] != envKey {
			return m
		}
		return value
	})
}

// EnvDefault extracts the :-default for envKey from template, or "".
func EnvDefault(template, envKey string) string {
	for _, sub := range envDefaultRe.FindAllStringSubmatch(template, -1) {
		if len(sub) >= 3 && sub[1] == envKey {
			return sub[2]
		}
	}
	return ""
}

// LabelValue returns deploy label value by exact key.
func LabelValue(svc Service, key string) string {
	if svc.Deploy.Labels == nil {
		return ""
	}
	return strings.TrimSpace(svc.Deploy.Labels[key])
}
