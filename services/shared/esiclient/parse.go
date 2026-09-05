package esiclient

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Redis returns every value from the scripts as a string, because a Lua number
// is truncated to an integer on the way out and these carry sub-second times.

func parseGrant(raw any, b Bucket, class Class, endpoint string) (Grant, error) {
	values, ok := raw.([]any)
	if !ok || len(values) < 8 {
		return Grant{}, fmt.Errorf("reserve returned %T with %d fields, want at least 8", raw, len(values))
	}

	fields := make([]string, len(values))
	for i, v := range values {
		fields[i] = fmt.Sprint(v)
	}

	grant := Grant{
		Granted: fields[0] == "1",
		Kind:    Kind(atoiOr(fields[1], 0)),
		RetryAt: unixFloat(fields[2]),
		State: BucketState{
			Limit:   atoiOr(fields[4], 0),
			Window:  time.Duration(atoiOr(fields[5], 0)) * time.Second,
			Metered: fields[6] == "1",
		},
		Available: int(floatOr(fields[3], 0)),
	}
	probe := fields[7] == "1"

	for i := 8; i+1 < len(fields); i += 2 {
		grant.Reservations = append(grant.Reservations, Reservation{
			ID:       fields[i],
			Bucket:   b,
			Class:    class,
			Endpoint: endpoint,
			Slot:     unixFloat(fields[i+1]),
			Cost:     SuccessCost,
			Probe:    probe,
		})
	}
	return grant, nil
}

func stateFromFields(fields map[string]string) BucketState {
	return BucketState{
		Limit:      atoiOr(fields["limit"], 0),
		Window:     time.Duration(atoiOr(fields["window"], 0)) * time.Second,
		Metered:    fields["metered"] == "1",
		Remaining:  atoiOr(fields["remaining"], -1),
		ObservedAt: unixFloat(fields["observed_at"]),
		GatedUntil: unixFloat(fields["gated_until"]),
		NextSlot:   unixFloat(fields["tat"]),
		ProbeUntil: unixFloat(fields["probe_until"]),
	}
}

// costFromMember reads the charge out of a ledger member, which is
// "id:cost:class:endpoint".
func costFromMember(member string) int {
	_, rest, found := strings.Cut(member, ":")
	if !found {
		return 0
	}
	cost, _, _ := strings.Cut(rest, ":")
	return atoiOr(cost, 0)
}

func atoiOr(s string, fallback int) int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return fallback
	}
	return n
}

func floatOr(s string, fallback float64) float64 {
	f, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil {
		return fallback
	}
	return f
}

func unixFloat(s string) time.Time {
	seconds := floatOr(s, 0)
	if seconds <= 0 {
		return time.Time{}
	}
	return time.Unix(int64(seconds), int64((seconds-float64(int64(seconds)))*1e9))
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
