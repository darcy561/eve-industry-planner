package config

import (
	"os"
	"testing"
)

func TestSlotClientCutoffDefaultAndUnlimited(t *testing.T) {
	t.Setenv("WS_SLOT_CLIENT_CUTOFF", "")
	if got := SlotClientCutoff(); got != defaultSlotClientCutoff {
		t.Fatalf("empty -> %d want %d", got, defaultSlotClientCutoff)
	}
	t.Setenv("WS_SLOT_CLIENT_CUTOFF", "0")
	if got := SlotClientCutoff(); got != 0 {
		t.Fatalf("0 -> %d want unlimited 0", got)
	}
	t.Setenv("WS_SLOT_CLIENT_CUTOFF", "1500")
	if got := SlotClientCutoff(); got != 1500 {
		t.Fatalf("1500 -> %d", got)
	}
	t.Setenv("WS_SLOT_CLIENT_CUTOFF", "nope")
	if got := SlotClientCutoff(); got != defaultSlotClientCutoff {
		t.Fatalf("invalid -> %d want default", got)
	}
}

func TestSlotAtClientCutoff(t *testing.T) {
	t.Setenv("WS_SLOT_CLIENT_CUTOFF", "2")
	if SlotAtClientCutoff(1) {
		t.Fatal("1 < 2")
	}
	if !SlotAtClientCutoff(2) {
		t.Fatal("2 >= 2")
	}
	t.Setenv("WS_SLOT_CLIENT_CUTOFF", "0")
	if SlotAtClientCutoff(99999) {
		t.Fatal("unlimited should never trip")
	}
	_ = os.Unsetenv("WS_SLOT_CLIENT_CUTOFF")
}

func TestSlotTargetClientsDefaultAndOff(t *testing.T) {
	t.Setenv("WS_SLOT_TARGET_CLIENTS", "")
	if got := SlotTargetClients(); got != defaultSlotTargetClients {
		t.Fatalf("empty -> %d want %d", got, defaultSlotTargetClients)
	}
	t.Setenv("WS_SLOT_TARGET_CLIENTS", "0")
	if got := SlotTargetClients(); got != 0 {
		t.Fatalf("0 -> %d want off 0", got)
	}
	t.Setenv("WS_SLOT_TARGET_CLIENTS", "1200")
	if got := SlotTargetClients(); got != 1200 {
		t.Fatalf("1200 -> %d", got)
	}
	t.Setenv("WS_SLOT_TARGET_CLIENTS", "nope")
	if got := SlotTargetClients(); got != defaultSlotTargetClients {
		t.Fatalf("invalid -> %d want default", got)
	}
	_ = os.Unsetenv("WS_SLOT_TARGET_CLIENTS")
}

func TestSlotAtTargetClients(t *testing.T) {
	t.Setenv("WS_SLOT_TARGET_CLIENTS", "2")
	if SlotAtTargetClients(1) {
		t.Fatal("1 < 2")
	}
	if !SlotAtTargetClients(2) {
		t.Fatal("2 >= 2")
	}
	t.Setenv("WS_SLOT_TARGET_CLIENTS", "0")
	if SlotAtTargetClients(99999) {
		t.Fatal("off should never trip")
	}
	_ = os.Unsetenv("WS_SLOT_TARGET_CLIENTS")
}
