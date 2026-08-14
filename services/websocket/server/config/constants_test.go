package config

import (
	"os"
	"testing"
)

func TestClientCutoffDefaultAndUnlimited(t *testing.T) {
	t.Setenv("WS_CLIENT_CUTOFF", "")
	if got := ClientCutoff(); got != defaultClientCutoff {
		t.Fatalf("empty -> %d want %d", got, defaultClientCutoff)
	}
	t.Setenv("WS_CLIENT_CUTOFF", "0")
	if got := ClientCutoff(); got != 0 {
		t.Fatalf("0 -> %d want unlimited 0", got)
	}
	t.Setenv("WS_CLIENT_CUTOFF", "1500")
	if got := ClientCutoff(); got != 1500 {
		t.Fatalf("1500 -> %d", got)
	}
	t.Setenv("WS_CLIENT_CUTOFF", "nope")
	if got := ClientCutoff(); got != defaultClientCutoff {
		t.Fatalf("invalid -> %d want default", got)
	}
}

func TestAtClientCutoff(t *testing.T) {
	t.Setenv("WS_CLIENT_CUTOFF", "2")
	if AtClientCutoff(1) {
		t.Fatal("1 < 2")
	}
	if !AtClientCutoff(2) {
		t.Fatal("2 >= 2")
	}
	t.Setenv("WS_CLIENT_CUTOFF", "0")
	if AtClientCutoff(99999) {
		t.Fatal("unlimited should never trip")
	}
	_ = os.Unsetenv("WS_CLIENT_CUTOFF")
}

func TestTargetClientsDefaultAndOff(t *testing.T) {
	t.Setenv("WS_TARGET_CLIENTS", "")
	if got := TargetClients(); got != defaultTargetClients {
		t.Fatalf("empty -> %d want %d", got, defaultTargetClients)
	}
	t.Setenv("WS_TARGET_CLIENTS", "0")
	if got := TargetClients(); got != 0 {
		t.Fatalf("0 -> %d want off 0", got)
	}
	t.Setenv("WS_TARGET_CLIENTS", "1200")
	if got := TargetClients(); got != 1200 {
		t.Fatalf("1200 -> %d", got)
	}
	t.Setenv("WS_TARGET_CLIENTS", "nope")
	if got := TargetClients(); got != defaultTargetClients {
		t.Fatalf("invalid -> %d want default", got)
	}
	_ = os.Unsetenv("WS_TARGET_CLIENTS")
}

func TestAtTargetClients(t *testing.T) {
	t.Setenv("WS_TARGET_CLIENTS", "2")
	if AtTargetClients(1) {
		t.Fatal("1 < 2")
	}
	if !AtTargetClients(2) {
		t.Fatal("2 >= 2")
	}
	t.Setenv("WS_TARGET_CLIENTS", "0")
	if AtTargetClients(99999) {
		t.Fatal("off should never trip")
	}
	_ = os.Unsetenv("WS_TARGET_CLIENTS")
}
