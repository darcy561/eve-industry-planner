package env

import (
	"os"
	"testing"

	"eve-industry-planner/deployment-tool/internal/kit"
)

func TestMain(m *testing.M) {
	// Local/CI unit tests do not bake ldflags; simulate a release channel so
	// WriteMissing / CheckUsable get a non-empty APP_VERSION default.
	prev := kit.Channel
	kit.Channel = "prerelease-test"
	code := m.Run()
	kit.Channel = prev
	os.Exit(code)
}
