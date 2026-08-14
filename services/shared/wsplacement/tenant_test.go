package wsplacement

import "testing"

func TestTenantKeys(t *testing.T) {
	t.Parallel()
	if TenantKeyAccount("  a1  ") != "account:a1" {
		t.Fatal("account")
	}
	if TenantKeyCorporation("c9") != "corporation:c9" {
		t.Fatal("corp")
	}
	if TenantKeyAlliance("all2") != "alliance:all2" {
		t.Fatal("alliance")
	}
	if TenantStringFromRouting("a", "c", "z") != "account:a" {
		t.Fatal("account wins")
	}
	if TenantStringFromRouting("", "c", "z") != "corporation:c" {
		t.Fatal("corp next")
	}
	if TenantStringFromRouting("", "", "z") != "alliance:z" {
		t.Fatal("alliance last")
	}
	if TenantKeyAccount("") != "" || TenantKeyCorporation("  ") != "" {
		t.Fatal("empty")
	}
}
