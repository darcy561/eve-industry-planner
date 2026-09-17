package wait_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/testing/wait"
)

// recorder captures what a failing For would have reported, so the failure path
// can be asserted without failing this test.
type recorder struct {
	testing.TB
	failed bool
	msg    string
}

func (r *recorder) Helper() {}

func (r *recorder) Fatalf(format string, args ...any) {
	r.failed = true
	r.msg = fmt.Sprintf(format, args...)
	panic(r) // unwind like a real Fatalf would
}

func runFor(timeout time.Duration, cond func() (bool, string)) (failed bool, msg string) {
	r := &recorder{}
	defer func() {
		if p := recover(); p != nil && p != any(r) {
			panic(p)
		}
		failed, msg = r.failed, r.msg
	}()
	wait.For(r, timeout, cond)
	return r.failed, r.msg
}

func TestFor_returnsOnceConditionHolds(t *testing.T) {
	n := 0
	start := time.Now()
	wait.For(t, time.Second, func() (bool, string) {
		n++
		return n >= 3, fmt.Sprintf("n=%d", n)
	})
	if n != 3 {
		t.Fatalf("cond ran %d times, want 3", n)
	}
	if elapsed := time.Since(start); elapsed > 500*time.Millisecond {
		t.Fatalf("took %v; should return as soon as the condition holds", elapsed)
	}
}

func TestFor_reportsLastDetailOnTimeout(t *testing.T) {
	failed, msg := runFor(30*time.Millisecond, func() (bool, string) {
		return false, "leader=none replicas=2"
	})
	if !failed {
		t.Fatal("expected a failure")
	}
	if !strings.Contains(msg, "leader=none replicas=2") {
		t.Fatalf("message %q does not carry the detail", msg)
	}
}

func TestFor_checksOnceEvenWithZeroTimeout(t *testing.T) {
	called := false
	wait.For(t, 0, func() (bool, string) {
		called = true
		return true, ""
	})
	if !called {
		t.Fatal("condition was never evaluated")
	}
}

func TestFor_timeoutWithoutDetailStillFails(t *testing.T) {
	failed, msg := runFor(20*time.Millisecond, func() (bool, string) { return false, "" })
	if !failed {
		t.Fatal("expected a failure")
	}
	if !strings.Contains(msg, "not met within") {
		t.Fatalf("message %q", msg)
	}
}

func TestUntil_succeeds(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	n := 0
	err := wait.Until(ctx, wait.Options{Every: 10 * time.Millisecond}, func(context.Context) (bool, string, error) {
		n++
		return n >= 3, "n", nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestUntil_aliveFails(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	err := wait.Until(ctx, wait.Options{
		Every: 10 * time.Millisecond,
		Alive: func() error { return context.Canceled },
	}, func(context.Context) (bool, string, error) {
		return false, "waiting", nil
	})
	if err == nil {
		t.Fatal("expected alive error")
	}
}

func TestUntil_timeoutCarriesDetail(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()
	err := wait.Until(ctx, wait.Options{Every: 10 * time.Millisecond}, func(context.Context) (bool, string, error) {
		return false, "desired=3 running=1", nil
	})
	if err == nil || !strings.Contains(err.Error(), "desired=3 running=1") {
		t.Fatalf("err = %v; want it to carry the detail", err)
	}
}

// A cancelled wait is not a timeout. Both end the loop through the same channel,
// so the detail that a timeout carries must not be attached to a caller that
// simply stopped waiting.
func TestUntil_cancelIsNotReportedAsATimeout(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()

	err := wait.Until(ctx, wait.Options{Every: 5 * time.Millisecond}, func(context.Context) (bool, string, error) {
		return false, "desired=3 running=1", nil
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
	if strings.Contains(err.Error(), "timeout") {
		t.Fatalf("err = %v; a cancel must not read as a timeout", err)
	}
}

func TestForTicking_stopsWhenTheConditionHolds(t *testing.T) {
	ticks := 0
	calls := 0
	wait.ForTicking(t, time.Second, 10*time.Millisecond,
		func(time.Duration) { ticks++ },
		func() (bool, string) {
			calls++
			return calls == 3, "not yet"
		})
	if calls != 3 || ticks != 2 {
		t.Fatalf("checked %d times after %d ticks; want 3 and 2", calls, ticks)
	}
}

func TestForTicking_reportsTheLastDetail(t *testing.T) {
	failed, msg := runForTicking(30*time.Millisecond, 10*time.Millisecond,
		func(time.Duration) {},
		func() (bool, string) { return false, "saw nothing" })
	if !failed || !strings.Contains(msg, "saw nothing") {
		t.Fatalf("timeout reported %q (failed=%v); want the condition's own detail", msg, failed)
	}
}

func runForTicking(timeout, step time.Duration, tick func(time.Duration), cond func() (bool, string)) (failed bool, msg string) {
	r := &recorder{}
	defer func() {
		if p := recover(); p != nil && p != any(r) {
			panic(p)
		}
		failed, msg = r.failed, r.msg
	}()
	wait.ForTicking(r, timeout, step, tick, cond)
	return r.failed, r.msg
}
