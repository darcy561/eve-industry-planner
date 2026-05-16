package mongoput

import (
	"reflect"
	"testing"
)

func TestDiffAddedJobIDs(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		prev []string
		next []string
		want []string
	}{
		{"empty_prev", nil, []string{"a", "b"}, []string{"a", "b"}},
		{"no_change", []string{"a", "b"}, []string{"a", "b"}, nil},
		{"append", []string{"a"}, []string{"a", "b"}, []string{"b"}},
		{"reorder_no_new", []string{"b", "a"}, []string{"a", "b"}, nil},
		{"ignores_empty_strings", []string{"a"}, []string{"a", "", "b", ""}, []string{"b"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := diffAddedJobIDs(tc.prev, tc.next)
			if len(got) == 0 && len(tc.want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("diffAddedJobIDs(%v, %v) = %v, want %v", tc.prev, tc.next, got, tc.want)
			}
		})
	}
}
