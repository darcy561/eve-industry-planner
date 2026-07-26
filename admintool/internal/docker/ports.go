package docker

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// FriendlyPorts formats Swarm published host ports as "80, 81, 443".
// Ranges with span ≤32 are expanded; expose-only (no publish) is skipped.
func FriendlyPorts(published []uint32) string {
	if len(published) == 0 {
		return ""
	}
	seen := map[uint32]struct{}{}
	out := make([]int, 0, len(published))
	for _, p := range published {
		if p == 0 {
			continue
		}
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, int(p))
	}
	if len(out) == 0 {
		return ""
	}
	sort.Ints(out)
	parts := make([]string, len(out))
	for i, p := range out {
		parts[i] = strconv.Itoa(p)
	}
	return strings.Join(parts, ", ")
}

// FormatReplicaDetail is "N/M up" with optional starting count.
func FormatReplicaDetail(running, desired, starting uint64) string {
	detail := fmt.Sprintf("%d/%d up", running, desired)
	if starting > 0 {
		detail = fmt.Sprintf("%s (%d starting)", detail, starting)
	}
	return detail
}
