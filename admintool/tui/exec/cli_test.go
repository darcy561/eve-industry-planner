package exec

import "testing"

func TestNormalizeArgs(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in   []string
		want []string
	}{
		{nil, nil},
		{[]string{"status"}, []string{"status"}},
		{[]string{"eip", "up"}, []string{"up"}},
		{[]string{"eip.exe", "dev", "-y"}, []string{"dev", "-y"}},
		{[]string{"EIP"}, []string{"EIP"}}, // only exact eip / eip.exe
	}
	for _, tc := range cases {
		got := normalizeArgs(tc.in)
		if len(got) != len(tc.want) {
			t.Fatalf("%v → %v want %v", tc.in, got, tc.want)
		}
		for i := range got {
			if got[i] != tc.want[i] {
				t.Fatalf("%v → %v want %v", tc.in, got, tc.want)
			}
		}
	}
}
