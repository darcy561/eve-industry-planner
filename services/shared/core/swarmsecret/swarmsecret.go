// Package swarmsecret resolves Swarm task values for #3: process env first,
// then /run/secrets/<name> when present.
//
// Env wins when set so local Compose and the expand bridge keep working without
// /run/secrets. Stack cutover mounts credential key names as secret files;
// mesh anchors (hosts, ports, public URLs) stay as plain task env and simply
// have no matching file.
package swarmsecret

import (
	"fmt"
	"os"
	"strings"
	"unicode"
)

// secretsDir is the Swarm secrets mount. Overridable in tests.
var secretsDir = "/run/secrets"

func lookup(name string) (string, bool) {
	if v := strings.TrimSpace(os.Getenv(name)); v != "" {
		return v, true
	}
	b, err := os.ReadFile(secretsDir + "/" + name)
	if err != nil {
		return "", false
	}
	v := strings.TrimRightFunc(string(b), unicode.IsSpace)
	if v == "" {
		return "", false
	}
	return v, true
}

// Get returns the value for name, or "" when missing.
func Get(name string) string {
	v, _ := lookup(name)
	return v
}

// Require returns the value for name, or an error naming the key.
func Require(name string) (string, error) {
	v, ok := lookup(name)
	if !ok {
		return "", fmt.Errorf("%s is required (env or %s/%s)", name, secretsDir, name)
	}
	return v, nil
}
