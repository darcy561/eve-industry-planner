package main

import (
	"strings"
	"testing"
	"time"

	rediscore "eve-industry-planner/shared/core/redis"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/esifake"
	"eve-industry-planner/testing/wait"
)

// A trigger carries no request: publishing it is the whole instruction, and what
// proves it arrived is the work having happened.
func TestPublishingATriggerRunsItsTask(t *testing.T) {
	w := startWorker(t)

	w.ESI.SetJSON("GET", "/industry/systems/", 200, `[
		{"solar_system_id":30000142,"cost_indices":[{"activity":"manufacturing","cost_index":0.0421}]},
		{"solar_system_id":30002187,"cost_indices":[{"activity":"manufacturing","cost_index":0.0176}]}
	]`)

	if err := eipnats.TriggerRefreshSystemIndexes(t.Context(), w.NATS); err != nil {
		t.Fatalf("publish: %v", err)
	}

	// The system's indices reaching Redis is the task having run: nothing else in
	// this stack writes them.
	wait.For(t, 20*time.Second, func() (bool, string) {
		var stored map[string]any
		err := rediscore.GetIndustrySystemIndex(t.Context(), w.Redis.Client, 30000142, &stored)
		if err != nil {
			return false, "system 30000142 has no stored indices: " + err.Error()
		}
		return len(stored) > 0, "system 30000142 stored empty"
	})

	w.ESI.AssertCalled("GET", "/industry/systems/", 1)
}

// A request-carrying task has to reach its handler with the fields the publisher
// set. The publish helper takes them as arguments and the handler reads them off
// a struct; between those two points they are JSON on two different queues, and
// nothing but a run through both proves the shape survived.
func TestAPublishedRequestReachesTheTaskThatRunsIt(t *testing.T) {
	w := startWorker(t)

	const regionID, stationID = 10000002, 60003760
	w.ESI.SetJSON("GET", "/markets/10000002/orders/", 200, `[]`)

	if err := eipnats.PublishRefreshRegionMarketOrders(t.Context(), w.NATS, regionID, stationID); err != nil {
		t.Fatalf("publish: %v", err)
	}

	// The region in the path is the request's own field. A task that ran on a
	// zero-valued request would ask for region 0, and a task that never ran would
	// ask for nothing.
	wait.For(t, 20*time.Second, func() (bool, string) {
		if len(w.ESI.CallsTo("GET", "/markets/10000002/orders/")) > 0 {
			return true, ""
		}
		return false, "no request for region 10000002; the task saw " + callSummary(w.ESI.Calls())
	})
}

// A subject the registry does not claim is refused rather than run on guessed
// settings, and refused terminally so it is not redelivered until the consumer's
// ceiling. Nothing downstream should see it at all.
func TestASubjectNamingNoTaskNeverReachesAHandler(t *testing.T) {
	w := startWorker(t)

	if err := w.NATS.Publish(t.Context(), "task.migration.somethingRetired",
		eipnats.Message{Type: "task", Data: []byte(`{"account_id":"acct-1"}`)}); err != nil {
		t.Fatalf("publish: %v", err)
	}

	// Give the subscriber the same room a real task gets to reach a handler.
	time.Sleep(2 * time.Second)
	if calls := w.ESI.Calls(); len(calls) != 0 {
		t.Errorf("an unregistered subject caused %d ESI calls", len(calls))
	}
}

// callSummary renders what the fake was asked for, so a failure says what the
// task did instead of only that it did not do the right thing.
func callSummary(calls []esifake.Call) string {
	if len(calls) == 0 {
		return "nothing at all"
	}
	paths := make([]string, 0, len(calls))
	for _, c := range calls {
		paths = append(paths, c.Method+" "+c.Path)
	}
	return strings.Join(paths, ", ")
}

// A request that cannot be decoded is terminal, and the queue must act on that:
// archived after one attempt rather than retried to the ceiling. The translation
// from the word a task uses to the sentinel asynq understands happens in the
// mux, and only a run through the real server shows the queue obeyed it.
func TestAnUndecodableRequestIsArchivedRatherThanRetried(t *testing.T) {
	w := startWorker(t)

	// A sound envelope carrying something that is not this task's request. Raw
	// bytes because the typed envelope will not marshal invalid JSON.
	if err := w.NATS.Publish(t.Context(), eipnats.RefreshRegionMarketOrders.Subject,
		[]byte(`{"type":"task","data":"not-an-object"}`)); err != nil {
		t.Fatalf("publish: %v", err)
	}

	queue := eipnats.RefreshRegionMarketOrders.DefaultPriority
	wait.For(t, 20*time.Second, func() (bool, string) {
		archived, err := w.Inspector.ListArchivedTasks(queue)
		if err != nil {
			return false, "reading the archive: " + err.Error()
		}
		if len(archived) > 0 {
			return true, ""
		}
		retrying, _ := w.Inspector.ListRetryTasks(queue)
		if len(retrying) > 0 {
			return false, "the task is waiting to be retried; a payload that cannot decode never will"
		}
		return false, "nothing archived and nothing retrying yet"
	})
}
