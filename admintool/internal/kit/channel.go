package kit

import (
	"os"
	"strings"
)

// Channel is the GitHub Release tag baked at link time (-ldflags) for binary updates,
// e.g. "cli", "prerelease", or "prerelease-<slug>". Empty in local builds → default "cli".
var Channel = ""

// KitBranch is the git branch baked at link time for stack YAML raw fetches,
// e.g. "Public", "Development", "swarm/hard-cutover". Empty → "Public".
var KitBranch = ""

// DefaultAppVersion is the Setup / eip init default for APP_VERSION.
// Only prerelease channels preset an image tag; Public "cli" does not.
func DefaultAppVersion() string {
	return channelTagFromAppVersion(strings.TrimSpace(Channel))
}

// BakedUpdateChannel returns Channel when it is a floating prerelease channel
// (used for Setup APP_VERSION). Public "cli" returns "".
func BakedUpdateChannel() string {
	return channelTagFromAppVersion(strings.TrimSpace(Channel))
}

// BinaryChannel is the Release tag for eip update / SelfUpdate.
// Order: non-empty Channel (including "cli") → default "cli".
func BinaryChannel() string {
	if ch := strings.TrimSpace(Channel); ch != "" {
		return ch
	}
	return "cli"
}

// ResolveKitBranch returns the git branch for stack YAML downloads.
// EIP_KIT_BRANCH overrides the bake; empty bake → Public.
func ResolveKitBranch() string {
	if b := strings.TrimSpace(os.Getenv("EIP_KIT_BRANCH")); b != "" {
		return b
	}
	if b := strings.TrimSpace(KitBranch); b != "" {
		return b
	}
	return "Public"
}

// channelTagFromAppVersion returns APP_VERSION when it names a floating
// prerelease eip/GHCR channel. Semver pins, "cli", and 0.0.0-prerelease.* return "".
func channelTagFromAppVersion(appVersion string) string {
	v := strings.TrimSpace(appVersion)
	if v == "prerelease" || strings.HasPrefix(v, "prerelease-") {
		return v
	}
	return ""
}
