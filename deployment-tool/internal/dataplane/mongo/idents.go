package mongo

import (
	"fmt"
	"regexp"
)

// safeMongoIdent is relative-safe for collection / index names embedded in mongosh JS.
var safeMongoIdent = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

func requireSafeIdent(kind, name string) error {
	if !safeMongoIdent.MatchString(name) {
		return fmt.Errorf("mongo: invalid %s %q", kind, name)
	}
	return nil
}

// wrapMongoshErr attaches mongosh combined stdout/stderr when present (fail-closed surface).
func wrapMongoshErr(err error, out, format string, args ...any) error {
	if err == nil {
		return nil
	}
	prefix := fmt.Sprintf(format, args...)
	if out != "" {
		return fmt.Errorf("%s: %w\n%s", prefix, err, out)
	}
	return fmt.Errorf("%s: %w", prefix, err)
}
