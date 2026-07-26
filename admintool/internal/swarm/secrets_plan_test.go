package swarm

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func filledRequiredEnv() map[string]string {
	m := map[string]string{}
	for _, k := range RequiredKeys {
		m[k] = "val-" + k
	}
	return m
}

func TestValidateEnvOK(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	var b strings.Builder
	for _, k := range RequiredKeys {
		b.WriteString(k + "=x\n")
	}
	if err := os.WriteFile(filepath.Join(home, ".env"), []byte(b.String()), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := ValidateEnv(home); err != nil {
		t.Fatal(err)
	}
}

func TestValidateEnvMissingRequired(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	if err := os.WriteFile(filepath.Join(home, ".env"), []byte("MONGO_USERNAME=x\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	err := ValidateEnv(home)
	if err == nil || !strings.Contains(err.Error(), "required secret") {
		t.Fatalf("got %v", err)
	}
}

func TestCollectSecretPayloads(t *testing.T) {
	t.Parallel()
	env := filledRequiredEnv()
	env["REDIS_PASSWORD_API"] = "opt" // optional set
	got, err := collectSecretPayloads(env, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got["REDIS_PASSWORD_API"] != "opt" {
		t.Fatalf("optional missing: %#v", got)
	}
	if len(got) != len(RequiredKeys)+1 {
		t.Fatalf("len=%d want %d", len(got), len(RequiredKeys)+1)
	}
}

func TestCollectSecretPayloadsOmitsUnsetOptional(t *testing.T) {
	t.Parallel()
	got, err := collectSecretPayloads(filledRequiredEnv(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got["REDIS_PASSWORD_API"]; ok {
		t.Fatal("unset optional should be omitted")
	}
}

func TestCollectSecretPayloadsUnknownAttachEmpty(t *testing.T) {
	t.Parallel()
	_, err := collectSecretPayloads(filledRequiredEnv(), []Attach{
		{Service: "api", Key: "UNKNOWN_STACK_SECRET"},
	})
	if err == nil || !strings.Contains(err.Error(), "UNKNOWN_STACK_SECRET") {
		t.Fatalf("got %v", err)
	}
}

func TestCollectSecretPayloadsUnknownAttachWithValue(t *testing.T) {
	t.Parallel()
	env := filledRequiredEnv()
	env["UNKNOWN_STACK_SECRET"] = "present"
	got, err := collectSecretPayloads(env, []Attach{
		{Service: "api", Key: "UNKNOWN_STACK_SECRET"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got["UNKNOWN_STACK_SECRET"] != "present" {
		t.Fatalf("%#v", got)
	}
}
