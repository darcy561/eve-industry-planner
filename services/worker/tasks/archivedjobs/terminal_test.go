package archivedjobs

import (
	"context"
	"testing"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/worker/taskrun"
)

// A request that names an owner the statistics work cannot serve is not a
// failure to retry — no number of attempts turns a corporation into an account,
// and a task that keeps coming back occupies the queue until its ceiling for
// nothing.
//
// These say so with the same word the consumer carrying the message uses, and
// the mux translates it for the queue. Nothing else asserts that, so a
// conversion back to a plain error would go unnoticed until a bad request sat in
// the retry cycle.
func TestARequestThatCannotBeServedIsTerminal(t *testing.T) {
	t.Parallel()

	deps := &taskrun.Dependencies{Mongo: &eipmongo.Mongo{}}

	run := map[string]func(eipnats.RebuildOwnerStatisticsRequest) error{
		"rebuild": func(req eipnats.RebuildOwnerStatisticsRequest) error {
			return RebuildOwnerStatistics(context.Background(), req, deps)
		},
		"apply delta": func(req eipnats.RebuildOwnerStatisticsRequest) error {
			return ApplyOwnerStatisticsDelta(context.Background(), req, deps)
		},
		"reconcile": func(req eipnats.RebuildOwnerStatisticsRequest) error {
			return ReconcileOwnerStatistics(context.Background(),
				eipnats.ReconcileOwnerStatisticsRequest{OwnerKind: req.OwnerKind, OwnerID: req.OwnerID}, deps)
		},
	}

	requests := map[string]eipnats.RebuildOwnerStatisticsRequest{
		"an owner kind that is not one":  {OwnerKind: "wormhole", OwnerID: "acct-1"},
		"no owner at all":                {},
		"a kind with no archive to read": {OwnerKind: string(models.OwnerCorporation), OwnerID: "corp-1"},
	}

	for taskName, call := range run {
		for reason, req := range requests {
			t.Run(taskName+": "+reason, func(t *testing.T) {
				err := call(req)
				if err == nil {
					t.Fatal("accepted a request it cannot serve")
				}
				if !eipnats.IsTerminal(err) {
					t.Errorf("err = %v, which the queue would retry to its ceiling", err)
				}
			})
		}
	}
}

// An owner the work can serve must not be refused as unservable — the guard has
// to separate the two, not reject everything.
func TestAServableOwnerIsNotRefusedAsTerminal(t *testing.T) {
	t.Parallel()

	// No Mongo behind the handle, so this fails somewhere in storage. What
	// matters is that it is not turned away before it gets there.
	err := RebuildOwnerStatistics(context.Background(),
		eipnats.RebuildOwnerStatisticsRequest{
			OwnerKind: string(models.OwnerAccount),
			OwnerID:   "acct-1",
		},
		&taskrun.Dependencies{Mongo: &eipmongo.Mongo{}})

	if err != nil && eipnats.IsTerminal(err) {
		t.Errorf("a valid account owner was refused as unservable: %v", err)
	}
}
