package mongo

import (
	"errors"
	"strings"
	"testing"
)

func TestRequireSafeIdent(t *testing.T) {
	t.Parallel()
	if err := requireSafeIdent("collection", "user_job_groups"); err != nil {
		t.Fatal(err)
	}
	if err := requireSafeIdent("index name", "users_meta_lastLoginAt_1"); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"", "bad;drop", "a.b", "x y", "foo/bar"} {
		if err := requireSafeIdent("name", bad); err == nil {
			t.Fatalf("want error for %q", bad)
		}
	}
}

func TestWrapMongoshErr(t *testing.T) {
	t.Parallel()
	if err := wrapMongoshErr(nil, "noise", "mongo: x"); err != nil {
		t.Fatalf("nil err: %v", err)
	}
	base := errors.New("exit 1")
	err := wrapMongoshErr(base, "", "mongo: index %s.%s", "users", "meta_accountID_1")
	if err == nil || !strings.Contains(err.Error(), "mongo: index users.meta_accountID_1") {
		t.Fatalf("got %v", err)
	}
	if !errors.Is(err, base) {
		t.Fatalf("want unwrap to base: %v", err)
	}
	err = wrapMongoshErr(base, "E11000 duplicate", "mongo: preimage %s", "users")
	if !strings.Contains(err.Error(), "E11000") {
		t.Fatalf("missing stderr: %v", err)
	}
}
