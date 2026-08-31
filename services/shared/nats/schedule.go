package nats

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/nats-io/nats.go/jetstream"
)

// Schedule headers the server sets and reads. Named here so inspection does not
// spell them at call sites.
const (
	headerSchedule       = "Nats-Schedule"
	headerScheduleTarget = "Nats-Schedule-Target"
)

// Schedule is a message the server is holding until its time.
type Schedule struct {
	// ID is the caller's name for it, and the last token of its subject.
	ID string
	// At is when it fires.
	At time.Time
	// Payload is delivered on the target subject at that time.
	Payload []byte
}

// scheduleSubject is where a schedule lives; its id is its identity, so
// scheduling under an existing id replaces that schedule.
func scheduleSubject(id string) string {
	return SubjectSchedulePrefix + "." + id
}

// scheduledSubject is where a schedule delivers when it fires.
func scheduledSubject(id string) string {
	return SubjectScheduledPrefix + "." + id
}

// validScheduleID keeps an id usable as the tail of a subject. Dots are allowed —
// a cron job's name carries one — but wildcards, spaces and empty tokens are not,
// since those would widen or break the subject the schedule lives on.
func validScheduleID(id string) error {
	if id == "" || strings.TrimSpace(id) != id {
		return fmt.Errorf("schedule id is required and may not be padded")
	}
	if strings.ContainsAny(id, " *>\t\n") {
		return fmt.Errorf("schedule id %q may not contain spaces or wildcards", id)
	}
	if strings.HasPrefix(id, ".") || strings.HasSuffix(id, ".") || strings.Contains(id, "..") {
		return fmt.Errorf("schedule id %q has an empty subject token", id)
	}
	return nil
}

// scheduleDeliveryTTL bounds how long a fired run waits for a consumer. The stream
// keeps schedule definitions for their lifetime, so without a TTL every delivery
// would be kept too. An hour outlives a deploy and is short enough that a run
// nothing collected expires rather than firing long after it was due.
const scheduleDeliveryTTL = time.Hour

// ScheduleAt defers payload until at, delivered on this schedule's own subject
// under `scheduled.`. The id is the schedule's identity: scheduling again under
// the same id replaces what was there, and cancelling takes the same id.
//
// A time in the past fires immediately.
func (n *NATS) ScheduleAt(ctx context.Context, id string, at time.Time, payload []byte) error {
	if n == nil || n.js == nil {
		return fmt.Errorf("nats handle is required")
	}
	if err := validScheduleID(id); err != nil {
		return err
	}
	if _, err := n.Schedules.Ensure(ctx); err != nil {
		return err
	}
	if _, err := n.js.Publish(ctx, scheduleSubject(id), payload,
		jetstream.WithScheduleAt(at),
		jetstream.WithScheduleTarget(scheduledSubject(id)),
		jetstream.WithScheduleTTL(scheduleDeliveryTTL),
	); err != nil {
		return fmt.Errorf("schedule %s: %w", id, err)
	}
	return nil
}

// CancelSchedule removes a schedule so it never fires. Cancelling one that does
// not exist is not an error — it is already not going to fire.
func (n *NATS) CancelSchedule(ctx context.Context, id string) error {
	if n == nil {
		return fmt.Errorf("nats handle is required")
	}
	if err := validScheduleID(id); err != nil {
		return err
	}
	stream, err := n.Schedules.Ensure(ctx)
	if err != nil {
		return err
	}
	if err := stream.Purge(ctx, jetstream.WithPurgeSubject(scheduleSubject(id))); err != nil {
		return fmt.Errorf("cancel schedule %s: %w", id, err)
	}
	return nil
}

// LookupSchedule returns one schedule, or false if nothing is waiting under id.
func (n *NATS) LookupSchedule(ctx context.Context, id string) (Schedule, bool, error) {
	if n == nil {
		return Schedule{}, false, fmt.Errorf("nats handle is required")
	}
	if err := validScheduleID(id); err != nil {
		return Schedule{}, false, err
	}
	stream, err := n.Schedules.Ensure(ctx)
	if err != nil {
		return Schedule{}, false, err
	}
	raw, err := stream.GetLastMsgForSubject(ctx, scheduleSubject(id))
	if err != nil {
		if errors.Is(err, jetstream.ErrMsgNotFound) {
			return Schedule{}, false, nil
		}
		return Schedule{}, false, fmt.Errorf("read schedule %s: %w", id, err)
	}
	return scheduleFromRaw(id, raw), true, nil
}

// ListSchedules lists what is waiting to fire.
func (n *NATS) ListSchedules(ctx context.Context) ([]Schedule, error) {
	if n == nil {
		return nil, fmt.Errorf("nats handle is required")
	}
	stream, err := n.Schedules.Ensure(ctx)
	if err != nil {
		return nil, err
	}
	info, err := stream.Info(ctx, jetstream.WithSubjectFilter(SubjectSchedulePrefix+".>"))
	if err != nil {
		return nil, fmt.Errorf("list schedules: %w", err)
	}

	out := make([]Schedule, 0, len(info.State.Subjects))
	for subject := range info.State.Subjects {
		id := strings.TrimPrefix(subject, SubjectSchedulePrefix+".")
		raw, err := stream.GetLastMsgForSubject(ctx, subject)
		if err != nil {
			if errors.Is(err, jetstream.ErrMsgNotFound) {
				continue
			}
			return nil, fmt.Errorf("read schedule %s: %w", id, err)
		}
		out = append(out, scheduleFromRaw(id, raw))
	}
	return out, nil
}

// scheduleFromRaw reads back what the server holds. The fire time is parsed from
// the header the server itself set, so a listing reports the schedule in force
// rather than what a caller once asked for.
func scheduleFromRaw(id string, raw *jetstream.RawStreamMsg) Schedule {
	s := Schedule{ID: id, Payload: raw.Data}
	expr := raw.Header.Get(headerSchedule)
	if at, ok := strings.CutPrefix(expr, "@at "); ok {
		if parsed, err := time.Parse(time.RFC3339, at); err == nil {
			s.At = parsed
		}
	}
	return s
}
