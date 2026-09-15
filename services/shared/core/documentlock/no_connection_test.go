package documentlock

import (
	"context"
	"testing"

	"eve-industry-planner/shared/models"
	eipredis "eve-industry-planner/shared/redis"
)

// A handle and a connection are separate things: Connect always pairs them,
// NewRedis(nil) does not. These entry points skip quietly when Redis is not
// configured, so a guard that checked the handle rather than the connection
// would turn every call into a logged failure.
func TestEntryPointsSkipQuietlyWithoutAConnection(t *testing.T) {
	ctx := context.Background()
	d := Deps{Redis: eipredis.NewRedis(nil)}
	owner := models.AccountOwner("acct")

	for name, call := range map[string]func() error{
		"add viewer": func() error {
			_, err := AddViewer(ctx, d.Redis, owner, "jobs", "doc", "sess")
			return err
		},
		"remove viewer": func() error {
			_, err := RemoveViewer(ctx, d.Redis, owner, "jobs", "doc", "sess")
			return err
		},
		"touch waitlist pulse": func() error {
			return TouchWaitlistPulse(ctx, d.Redis, owner, "jobs", "doc", "sess")
		},
	} {
		t.Run(name, func(t *testing.T) {
			if err := call(); err != nil {
				t.Errorf("%s with no connection = %v, want a quiet skip", name, err)
			}
		})
	}
}

// The waitlist reads have no quiet-skip contract: they report the failure to a
// caller that takes an error. What they must not do is panic, which is what a
// nil client would have done.
func TestWaitlistReadsReportRatherThanPanic(t *testing.T) {
	ctx := context.Background()
	r := eipredis.NewRedis(nil)

	if _, err := PeekWaitlistHead(ctx, r, models.AccountOwner("acct"), "jobs", "doc"); err == nil {
		t.Error("peek with no connection reported success")
	}
	if _, err := WaitlistLen(ctx, r, models.AccountOwner("acct"), "jobs", "doc"); err == nil {
		t.Error("length with no connection reported success")
	}
}

// The ingress helpers take no error, so the same case must not panic.
func TestIngressHelpersSurviveNoConnection(t *testing.T) {
	ctx := context.Background()
	d := Deps{Redis: eipredis.NewRedis(nil)}
	owner := models.AccountOwner("acct")

	HandleViewerArrivedIngress(ctx, d, owner, "sess", "jobs", "doc")
	HandleViewerDepartedIngress(ctx, d, owner, "sess", "jobs", "doc")
}
