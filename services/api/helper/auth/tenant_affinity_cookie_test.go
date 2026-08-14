package auth

import "testing"

func TestFormatTenantAffinityKey(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name                    string
		account, corp, alliance string
		want                    string
	}{
		{name: "account only", account: "acct1", want: "account:acct1"},
		{name: "corp over account", account: "acct1", corp: "corp9", want: "corporation:corp9"},
		{name: "alliance wins", account: "acct1", corp: "corp9", alliance: "all2", want: "alliance:all2"},
		{name: "trim whitespace", account: "  acct1  ", want: "account:acct1"},
		{name: "empty", want: ""},
		{name: "blank alliance falls to corp", corp: "c1", alliance: "  ", want: "corporation:c1"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := FormatTenantAffinityKey(tc.account, tc.corp, tc.alliance)
			if got != tc.want {
				t.Fatalf("FormatTenantAffinityKey(%q,%q,%q)=%q want %q", tc.account, tc.corp, tc.alliance, got, tc.want)
			}
		})
	}
}
