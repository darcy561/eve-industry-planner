package kit

import "strings"

// Channel is the floating prerelease channel baked at link time (-ldflags),
// e.g. "prerelease" or "prerelease-<slug>". Empty for Public and local builds:
// Public operators set APP_VERSION themselves; update-binary uses /releases/latest.
var Channel = ""

// DefaultAppVersion is the Setup / eip init default for APP_VERSION (prerelease only).
func DefaultAppVersion() string {
	return BakedUpdateChannel()
}

// BakedUpdateChannel returns Channel when it is a floating prerelease channel.
func BakedUpdateChannel() string {
	return channelTagFromAppVersion(strings.TrimSpace(Channel))
}
