// What the session endpoints can put on the wire, written down where the SPA
// can read it.
//
// The SPA parses these responses by hand — it reads named keys off the JSON and
// stores what it finds. A field it reads that the server does not send silently
// yields undefined, and neither side's own tests notice: the Go tests assert
// what the handler writes, and the SPA tests assert against fixtures the SPA
// itself authored.
//
// So the surface is derived from the response types by reflection, committed,
// and checked here. The SPA's own parity test reads the same file, which is what
// makes a field added on one side visible to the other.
package v1endpoints_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"

	"eve-industry-planner/api/v1endpoints"

	modelparity "eve-industry-planner/testing/model_parity/lib"
)

// surfacePath is the committed fixture, relative to this package.
const surfacePath = "../../../testing/fixtures/session-responses/surface.json"

const regenerate = "EIP_UPDATE_SESSION_SURFACE=1 go test ./api/v1endpoints/ -run TestTheSessionResponseSurfaceIsCurrent"

const surfaceWhy = "Every JSON path the planner session endpoints can emit, by " +
	"reflection over the response types. The SPA parses these responses key by " +
	"key, so a key it reads that is absent here is a key nothing sends. " +
	"Regenerate with: " + regenerate

type responseSurface struct {
	Why   string              `json:"why"`
	Types map[string][]string `json:"types"`
}

// The two response shapes a planner session arrives in. Login and bootstrap
// share one; the periodic rotate has its own.
func sessionResponseSurface() responseSurface {
	return responseSurface{
		Why: surfaceWhy,
		Types: map[string][]string{
			"SessionBootstrapResponse": modelparity.JSONPaths(
				reflect.TypeFor[v1endpoints.SessionBootstrapResponse](),
			),
			"SessionRotateResponse": modelparity.JSONPaths(
				reflect.TypeFor[v1endpoints.SessionRotateResponse](),
			),
		},
	}
}

// A response type gaining or losing a field changes what the SPA may read, so
// the committed surface has to move with it in the same commit.
func TestTheSessionResponseSurfaceIsCurrent(t *testing.T) {
	current := sessionResponseSurface()

	encoded, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		t.Fatalf("encode the surface: %v", err)
	}
	encoded = append(encoded, '\n')

	if os.Getenv("EIP_UPDATE_SESSION_SURFACE") == "1" {
		if err := os.MkdirAll(filepath.Dir(surfacePath), 0o755); err != nil {
			t.Fatalf("create the fixture directory: %v", err)
		}
		if err := os.WriteFile(surfacePath, encoded, 0o644); err != nil {
			t.Fatalf("write the surface: %v", err)
		}
		t.Logf("wrote %s", surfacePath)
		return
	}

	committed, err := os.ReadFile(surfacePath)
	if err != nil {
		t.Fatalf("read the committed surface: %v\nregenerate with: %s", err, regenerate)
	}
	if string(committed) != string(encoded) {
		t.Fatalf("the committed session response surface is stale.\n"+
			"A response type changed without %s moving with it, so the SPA is "+
			"checking its parsing against a surface that no longer exists.\n"+
			"Regenerate with: %s",
			surfacePath, regenerate)
	}
}

// The fields the SPA is known to read, asserted here as well as in the SPA's own
// parity test. A Go author removing one of these sees a Go test fail, rather
// than finding out from a client that stopped working.
func TestTheSurfaceCarriesWhatTheClientReads(t *testing.T) {
	surface := sessionResponseSurface()

	// The rotate response is the narrower of the two, and every field the SPA's
	// session persistence reads has to be on it: a rotate is what keeps a live
	// session alive, so a field missing there is a field lost mid-session.
	for _, path := range []string{"session_id", "refresh_token", "reauth_required_at"} {
		if !slices.Contains(surface.Types["SessionRotateResponse"], path) {
			t.Errorf("the rotate response no longer carries %q, which the SPA stores", path)
		}
	}

	for _, path := range []string{"session_id", "refresh_token", "reauth_required_at",
		"esi_oauth_storage", "first_login", "main_character_hash"} {
		if !slices.Contains(surface.Types["SessionBootstrapResponse"], path) {
			t.Errorf("the bootstrap response no longer carries %q, which the SPA reads", path)
		}
	}
}
