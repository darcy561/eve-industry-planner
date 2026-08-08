package main

import (
	"fmt"
	"net/http"
)

type soakProfile string

const (
	profileHold   soakProfile = "hold"
	profileLimits soakProfile = "limits"
)

func parseProfile(s string) (soakProfile, error) {
	switch soakProfile(s) {
	case profileHold, profileLimits:
		return soakProfile(s), nil
	default:
		return "", fmt.Errorf("profile must be hold|limits, got %q", s)
	}
}

// limitsPlan sizes a soft→hard pressure soak against operator-synced thresholds.
// Fill cohort shares one corp place key; soft_divert / full_probe use mixed
// account|corp|alliance keys (place misses) to prove router divert.
type limitsPlan struct {
	ExpectTarget     int
	ExpectCutoff     int
	FillHolders      int
	SoftDivert       int
	FullProbes       int
	Clients          int
	FillCorpID       int64
	MinDivertRatio   float64
	ReconnectHolders bool
	ReconnectProbes  bool
}

func buildLimitsPlan(expectTarget, expectCutoff, clients, softDivert, fullProbes int, fillCorpID int64, minDivertRatio float64) (limitsPlan, error) {
	if expectTarget < 1 {
		return limitsPlan{}, fmt.Errorf("limits profile: -expect-target must be >= 1 (got %d)", expectTarget)
	}
	if expectCutoff < expectTarget {
		return limitsPlan{}, fmt.Errorf("limits profile: -expect-cutoff (%d) must be >= -expect-target (%d)", expectCutoff, expectTarget)
	}
	fill := expectCutoff
	if softDivert < 1 {
		softDivert = max(expectTarget/2, 12)
	}
	if fullProbes < 1 {
		fullProbes = max(expectCutoff/4, 10)
	}
	total := fill + softDivert + fullProbes
	if clients > 0 {
		// Allow override only when large enough for all cohorts.
		if clients < total {
			return limitsPlan{}, fmt.Errorf("limits profile: -clients (%d) < fill+soft_divert+full_probe (%d)", clients, total)
		}
		// Extra clients become more soft-divert keys.
		softDivert += clients - total
		total = clients
	}
	if fillCorpID == 0 {
		fillCorpID = defaultFillCorpID
	}
	if minDivertRatio <= 0 {
		minDivertRatio = 0.8
	}
	if minDivertRatio > 1 {
		return limitsPlan{}, fmt.Errorf("limits profile: -min-divert-ratio must be <= 1")
	}
	return limitsPlan{
		ExpectTarget:     expectTarget,
		ExpectCutoff:     expectCutoff,
		FillHolders:      fill,
		SoftDivert:       softDivert,
		FullProbes:       fullProbes,
		Clients:          total,
		FillCorpID:       fillCorpID,
		MinDivertRatio:   minDivertRatio,
		ReconnectHolders: true,
		ReconnectProbes:  false,
	}, nil
}

type limitsEvidence struct {
	SoftSeen     bool
	FullSeen     bool
	Refuse503    uint64
	ConnectedOK  uint64
	ExpectTarget int
	ExpectCutoff int
	Require503   bool

	SoftSlots         []string
	FullSlots         []string
	SoftDivertTotal   int
	SoftDivertOffSoft int
	SoftDivertOnSoft  int
	FullProbeTotal    int
	FullProbeOffFull  int
	FullProbeOnFull   int
	MinDivertRatio    float64
	SkipDivertAssert  bool // e.g. single replica — no non-soft home
	AffinityAccount   int
	AffinityCorp      int
	AffinityAlliance  int
}

func (e limitsEvidence) assert() error {
	if e.ConnectedOK < uint64(e.ExpectTarget) {
		return fmt.Errorf("limits: connected_ok=%d < expect-target=%d (is stack synced to these thresholds?)", e.ConnectedOK, e.ExpectTarget)
	}
	if !e.SoftSeen {
		return fmt.Errorf("limits: never saw NATS soft placement state — sync target_clients=%d then re-run", e.ExpectTarget)
	}
	if !e.FullSeen {
		return fmt.Errorf("limits: never saw NATS full placement state — sync client_cutoff=%d and use enough fill holders", e.ExpectCutoff)
	}
	if e.Require503 && e.Refuse503 == 0 {
		return fmt.Errorf("limits: -require-503 set but no HTTP %d refuses (point -ws-url at a single websocket task to bypass router divert)", http.StatusServiceUnavailable)
	}
	if e.SkipDivertAssert {
		return nil
	}
	if e.SoftDivertTotal > 0 {
		ratio := float64(e.SoftDivertOffSoft) / float64(e.SoftDivertTotal)
		if ratio < e.MinDivertRatio {
			return fmt.Errorf("limits: soft divert ratio %.2f (%d/%d off soft %v) < min %.2f — new mixed keys should prefer non-soft",
				ratio, e.SoftDivertOffSoft, e.SoftDivertTotal, e.SoftSlots, e.MinDivertRatio)
		}
	}
	if e.FullProbeTotal > 0 && e.FullProbeOnFull > 0 {
		// Router must hard-skip full; any place onto a full container is a failure.
		return fmt.Errorf("limits: %d/%d full-probe keys placed on full container(s) %v (want 0)",
			e.FullProbeOnFull, e.FullProbeTotal, e.FullSlots)
	}
	return nil
}
