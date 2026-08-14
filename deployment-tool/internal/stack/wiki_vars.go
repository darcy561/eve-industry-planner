package stack

import (
	"bytes"
	"fmt"
	"net/url"
	"strings"
	"unicode"

	"github.com/compose-spec/compose-go/v2/types"
)

const (
	envWikiCompatTag = "WIKI_COMPAT_TAG"
	envWikiHost      = "EIP_WIKI_HOST"
	envAppVersion    = "APP_VERSION"
	envEveCallback   = "EVE_CALLBACK_URL"
)

// WikiCompatTag is the GHCR tag for eve-industry-planner-wiki.
// Public X.Y.Z → X.Y (moving minor). Anything else (prerelease, latest, floats) is APP_VERSION as-is.
func WikiCompatTag(appVersion string) string {
	appVersion = strings.TrimSpace(appVersion)
	if appVersion == "" {
		return ""
	}
	v := strings.TrimPrefix(appVersion, "v")
	if strings.ContainsAny(v, "-+") {
		return appVersion
	}
	major, rest, ok := strings.Cut(v, ".")
	if !ok || major == "" || !allDigits(major) {
		return appVersion
	}
	minor, patch, ok := strings.Cut(rest, ".")
	if !ok || minor == "" || patch == "" || strings.Contains(patch, ".") {
		return appVersion
	}
	if !allDigits(minor) || !allDigits(patch) {
		return appVersion
	}
	return major + "." + minor
}

// WikiHost is the Traefik Host() parent for wiki.{host}.
// Dev is always localhost. Live is the hostname of EVE_CALLBACK_URL.
func WikiHost(source, callbackURL string) (string, error) {
	if source == "dev" {
		return "localhost", nil
	}
	u, err := url.Parse(strings.TrimSpace(callbackURL))
	if err != nil || u.Hostname() == "" {
		return "", fmt.Errorf("stack: EIP_WIKI_HOST: EVE_CALLBACK_URL must include a host")
	}
	return u.Hostname(), nil
}

func applyWikiExpandEnv(env types.Mapping, source string, sources []composeSource) error {
	if env == nil {
		return fmt.Errorf("stack: empty expand env")
	}
	if tag := WikiCompatTag(env[envAppVersion]); tag != "" {
		env[envWikiCompatTag] = tag
	}
	if !wikiExpandNeedsHost(sources) {
		return nil
	}
	host, err := WikiHost(source, env[envEveCallback])
	if err != nil {
		return err
	}
	env[envWikiHost] = host
	return nil
}

func wikiExpandNeedsHost(sources []composeSource) bool {
	for _, src := range sources {
		if bytes.Contains(src.YAML, []byte(envWikiHost)) {
			return true
		}
	}
	return false
}

func allDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}
