package helpers

import "sort"

// UnionSortedNonEmpty returns the sorted union of two string slices, skipping empty strings.
func UnionSortedNonEmpty(a, b []string) []string {
	set := map[string]struct{}{}
	for _, s := range a {
		if s != "" {
			set[s] = struct{}{}
		}
	}
	for _, s := range b {
		if s != "" {
			set[s] = struct{}{}
		}
	}
	out := make([]string, 0, len(set))
	for s := range set {
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}
