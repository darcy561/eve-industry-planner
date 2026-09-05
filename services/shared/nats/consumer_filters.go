package nats

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"eve-industry-planner/shared/logs"

	"github.com/nats-io/nats.go/jetstream"
)

// DocUpdateFilterInert is a FilterSubjects entry that matches no published traffic.
// Empty FilterSubjects means "all stream subjects" in JetStream — never use empty for
// selective fan-out when the hosted set is empty.
const DocUpdateFilterInert = "doc.update.__none__.>"

// DocLockFilterInert matches no published doc.lock traffic (same empty-set rule).
const DocLockFilterInert = "doc.lock.__none__"

// NormalizeFilterSubjects trims, drops empties, dedupes, and sorts for stable compare/update.
func NormalizeFilterSubjects(subjects []string) []string {
	if len(subjects) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(subjects))
	out := make([]string, 0, len(subjects))
	for _, s := range subjects {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}

// ConsumerFilterSubjects returns the effective filter list from a consumer config
// (FilterSubjects if set, else singular FilterSubject).
func ConsumerFilterSubjects(cfg jetstream.ConsumerConfig) []string {
	if len(cfg.FilterSubjects) > 0 {
		return NormalizeFilterSubjects(cfg.FilterSubjects)
	}
	if s := strings.TrimSpace(cfg.FilterSubject); s != "" {
		return []string{s}
	}
	return nil
}

// UpdateConsumerFilterSubjects sets FilterSubjects on an existing durable.
// No-op when the normalised desired set equals the current filters.
// Pass an empty desired slice only when the caller has already substituted an inert pattern;
// this helper will not invent inert subjects.
func UpdateConsumerFilterSubjects(ctx context.Context, stream jetstream.Stream, durable string, subjects []string) error {
	if stream == nil {
		return fmt.Errorf("UpdateConsumerFilterSubjects: nil stream")
	}
	durable = strings.TrimSpace(durable)
	if durable == "" {
		return fmt.Errorf("UpdateConsumerFilterSubjects: empty durable")
	}
	desired := NormalizeFilterSubjects(subjects)
	if len(desired) == 0 {
		return fmt.Errorf("UpdateConsumerFilterSubjects: empty subjects (use inert pattern for no interest)")
	}

	cons, err := stream.Consumer(ctx, durable)
	if err != nil {
		return fmt.Errorf("UpdateConsumerFilterSubjects: get consumer %s: %w", durable, err)
	}
	info, err := cons.Info(ctx)
	if err != nil {
		return fmt.Errorf("UpdateConsumerFilterSubjects: info %s: %w", durable, err)
	}
	current := ConsumerFilterSubjects(info.Config)
	if subjectsAsSetEqual(current, desired) {
		return nil
	}

	updateCfg := info.Config
	updateCfg.FilterSubject = ""
	updateCfg.FilterSubjects = append([]string(nil), desired...)
	if _, err := stream.UpdateConsumer(ctx, updateCfg); err != nil {
		logs.WarnCtx(ctx, "failed to update consumer FilterSubjects",
			"consumer", durable, "from", current, "to", desired, "error", err)
		return fmt.Errorf("UpdateConsumerFilterSubjects: update %s: %w", durable, err)
	}
	logs.InfoCtx(ctx, "updated consumer FilterSubjects",
		"consumer", durable, "from", current, "to", desired)
	return nil
}

// subjectsAsSetEqual reports whether a and b hold the same subjects, order ignored.
func subjectsAsSetEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	counts := make(map[string]int, len(a))
	for _, s := range a {
		counts[s]++
	}
	for _, s := range b {
		counts[s]--
		if counts[s] < 0 {
			return false
		}
	}
	for _, n := range counts {
		if n != 0 {
			return false
		}
	}
	return true
}
