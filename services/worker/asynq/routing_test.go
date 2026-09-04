package asynq

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/queuescale"
	"eve-industry-planner/worker/taskrun"
	"github.com/hibiken/asynq"
	"testing"
	"time"
)

func TestTaskTimeoutComesFromTheDefinition(t *testing.T) {
	got := taskTimeoutFor(eipnats.RefreshRegionMarketOrders)
	want := eipnats.RefreshRegionMarketOrders.DefaultTimeout
	if got != want {
		t.Fatalf("taskTimeoutFor(refreshRegionMarketOrders) = %v, want %v", got, want)
	}
}

// A definition's timeout is still clamped, which is what keeps an implausible
// value in tasks.go from becoming an asynq deadline.
func TestATaskTimeoutIsClamped(t *testing.T) {
	if got := clampTaskTimeout(time.Second); got != minTaskTimeout {
		t.Fatalf("clamp(1s) = %v, want min %v", got, minTaskTimeout)
	}
	if got := clampTaskTimeout(72 * time.Hour); got != maxTaskTimeout {
		t.Fatalf("clamp(72h) = %v, want max %v", got, maxTaskTimeout)
	}
}

// The asynq mux keys handlers by a bare string. A drain task whose handler key
// does not match its task name is registered but never routed to — the queue
// would fill with nothing draining it and no error anywhere to say so.
func TestDrainAccountStatsRebuildQueue_TaskNameIsRegistered(t *testing.T) {
	task := eipnats.DrainAccountStatsRebuildQueue

	if task.Name != "drainAccountStatsRebuildQueue" {
		t.Fatalf("task name = %q; the asynq handler key in handlers.go must be updated to match", task.Name)
	}

	got, ok := eipnats.LookupTask(task.Name)
	if !ok {
		t.Fatalf("the registry is missing %q, so the worker falls back to the default timeout", task.Name)
	}
	if got.DefaultTimeout != task.DefaultTimeout {
		t.Fatalf("registry[%q].DefaultTimeout = %v, want %v", task.Name, got.DefaultTimeout, task.DefaultTimeout)
	}
	if taskTimeoutFor(task) != task.DefaultTimeout {
		t.Fatalf("taskTimeoutFor(%q) = %v, want %v", task.Name, taskTimeoutFor(task), task.DefaultTimeout)
	}
}

// Every task must have a handler and every handler must serve a task. A task
// published with nothing registered to run it is accepted by asynq and then
// discarded, and a handler for a name no task carries is never reached; neither
// says anything at the time, so the wiring refuses to build instead.
func TestTheHandlersCoverTheRegistryExactly(t *testing.T) {
	// Nothing is executed, so the dependencies are never dereferenced.
	if err := SetupHandlers(asynq.NewServeMux(), &taskrun.Dependencies{}); err != nil {
		t.Fatalf("the worker would not start: %v", err)
	}
}

// The check has to be able to fail, or it says nothing about the real wiring.
func TestAMissingHandlerRefusesToMount(t *testing.T) {
	t.Parallel()

	err := mount(asynq.NewServeMux(), map[string]asynq.HandlerFunc{})
	if err == nil {
		t.Fatal("mounted no handlers at all without complaint")
	}
	if !strings.Contains(err.Error(), eipnats.RefreshRegionMarketOrders.Name) {
		t.Errorf("err = %v, which does not name a task left without a handler", err)
	}
}

// A handler under a name no task carries is dead code that looks wired, and it
// is usually a task renamed on one side only.
func TestAHandlerForNoTaskRefusesToMount(t *testing.T) {
	t.Parallel()

	handlers := map[string]asynq.HandlerFunc{}
	for _, task := range eipnats.Tasks() {
		handlers[task.Name] = func(context.Context, *asynq.Task) error { return nil }
	}
	handlers["renamedLastWeek"] = func(context.Context, *asynq.Task) error { return nil }

	err := mount(asynq.NewServeMux(), handlers)
	if err == nil {
		t.Fatal("a handler serving no task mounted without complaint")
	}
	if !strings.Contains(err.Error(), "renamedLastWeek") {
		t.Errorf("err = %v, which does not name the handler that serves nothing", err)
	}
}

// The request reaches the handler as the publisher wrote it, with nothing
// wrapping it: asynq carries the task type in its own field.
func TestDecodeRequestReadsThePublishedRequest(t *testing.T) {
	t.Parallel()

	task := asynq.NewTask(eipnats.RefreshRegionMarketOrders.Name,
		[]byte(`{"region_id":10000002,"station_id":60003760}`))

	got, err := decodeRequest[eipnats.RegionMarketOrdersRequest](task)
	if err != nil {
		t.Fatalf("decodeRequest: %v", err)
	}
	want := eipnats.RegionMarketOrdersRequest{RegionID: 10000002, StationID: 60003760}
	if got != want {
		t.Fatalf("decoded %+v, want %+v", got, want)
	}
}

// A payload that cannot produce a request will not produce one on a retry
// either, so both refusals are terminal rather than occupying the queue to the
// retry ceiling. JSON null is refused rather than decoded: it unmarshals into any
// struct without complaint, which would run the task on an empty request.
func TestAnUnusableRequestIsRefusedTerminally(t *testing.T) {
	t.Parallel()

	for name, payload := range map[string]string{
		"absent":   ``,
		"null":     `null`,
		"not json": `{"region_id":`,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := decodeRequest[eipnats.RegionMarketOrdersRequest](
				asynq.NewTask(eipnats.RefreshRegionMarketOrders.Name, []byte(payload)))
			if err == nil {
				t.Fatal("decoded successfully")
			}
			if !eipnats.IsTerminal(err) {
				t.Fatalf("err = %v, which the queue would retry", err)
			}
		})
	}
}

// One vocabulary reaches both engines: a task says "this cannot succeed" the way
// the consumer carrying it does, and the queue is told in the only word it knows.
func TestATerminalErrorStopsTheQueueRedispatching(t *testing.T) {
	t.Parallel()

	cause := errors.New("owner kind has no archive")
	err := terminalAsSkipRetry(fmt.Errorf("%w: %w", cause, eipnats.Terminate("gave up")))

	if !errors.Is(err, asynq.SkipRetry) {
		t.Error("the queue would keep redispatching work that cannot succeed")
	}
	if !errors.Is(err, cause) {
		t.Error("translating the error lost what actually failed")
	}
}

func TestAnOrdinaryFailureIsStillRetried(t *testing.T) {
	t.Parallel()

	err := terminalAsSkipRetry(errors.New("mongo unavailable"))
	if errors.Is(err, asynq.SkipRetry) {
		t.Error("a transient failure was marked as never retryable")
	}
}

// A registered task reaches its handler with the request decoded into the type
// that handler declared. This is the wiring the mux does and the reason handlers
// no longer decode: nothing else checks that a task's payload and its handler's
// parameter are the same shape.
func TestARegisteredTaskReachesItsHandlerWithTheRequest(t *testing.T) {
	t.Parallel()

	var got eipnats.RegionMarketOrdersRequest
	var gotDeps *taskrun.Dependencies
	deps := &taskrun.Dependencies{}

	mux := asynq.NewServeMux()
	handlers := map[string]asynq.HandlerFunc{}
	handle(handlers, eipnats.RefreshRegionMarketOrders, deps,
		func(_ context.Context, req eipnats.RegionMarketOrdersRequest, d *taskrun.Dependencies) error {
			got, gotDeps = req, d
			return nil
		})
	mux.Handle(eipnats.RefreshRegionMarketOrders.Name, handlers[eipnats.RefreshRegionMarketOrders.Name])

	task := asynq.NewTask(eipnats.RefreshRegionMarketOrders.Name,
		[]byte(`{"region_id":10000002,"station_id":60003760}`))
	if err := mux.ProcessTask(t.Context(), task); err != nil {
		t.Fatalf("ProcessTask: %v", err)
	}

	want := eipnats.RegionMarketOrdersRequest{RegionID: 10000002, StationID: 60003760}
	if got != want {
		t.Errorf("handler received %+v, want %+v", got, want)
	}
	if gotDeps != deps {
		t.Error("the handler was given a different dependency bag than the mux was built with")
	}
}

// A trigger's queue name is the whole instruction, so its handler runs without
// being handed anything to decode.
func TestARegisteredTriggerReachesItsHandler(t *testing.T) {
	t.Parallel()

	ran := false
	mux := asynq.NewServeMux()
	handlers := map[string]asynq.HandlerFunc{}
	handleTrigger(handlers, eipnats.CheckSDEUpdates, &taskrun.Dependencies{},
		func(context.Context, *taskrun.Dependencies) error {
			ran = true
			return nil
		})
	mux.Handle(eipnats.CheckSDEUpdates.Name, handlers[eipnats.CheckSDEUpdates.Name])

	if err := mux.ProcessTask(t.Context(), asynq.NewTask(eipnats.CheckSDEUpdates.Name, nil)); err != nil {
		t.Fatalf("ProcessTask: %v", err)
	}
	if !ran {
		t.Error("a trigger with no payload never reached its handler")
	}
}

// A request that cannot be decoded must not reach the handler at all, and the
// refusal has to name the task — the payload alone does not say which one it
// failed to be.
func TestAnUndecodableRequestNeverReachesTheHandler(t *testing.T) {
	t.Parallel()

	ran := false
	mux := asynq.NewServeMux()
	handlers := map[string]asynq.HandlerFunc{}
	handle(handlers, eipnats.RefreshRegionMarketOrders, &taskrun.Dependencies{},
		func(context.Context, eipnats.RegionMarketOrdersRequest, *taskrun.Dependencies) error {
			ran = true
			return nil
		})
	mux.Handle(eipnats.RefreshRegionMarketOrders.Name, handlers[eipnats.RefreshRegionMarketOrders.Name])

	err := mux.ProcessTask(t.Context(),
		asynq.NewTask(eipnats.RefreshRegionMarketOrders.Name, []byte(`{`)))
	if err == nil {
		t.Fatal("a malformed request was accepted")
	}
	if ran {
		t.Error("the handler ran on a request that could not be decoded")
	}
	if !strings.Contains(err.Error(), eipnats.RefreshRegionMarketOrders.Name) {
		t.Errorf("err = %v, which does not say which task it was", err)
	}
	if !eipnats.IsTerminal(err) {
		t.Error("the queue would retry a payload that cannot become a request")
	}
}

// Every queue a task can be published to must be one the server polls. A task
// definition naming a queue the server does not serve is accepted, queued, and
// never run — the work simply does not happen, and nothing says so.
func TestTheServerPollsEveryQueueATaskCanUse(t *testing.T) {
	t.Parallel()

	for _, task := range eipnats.Tasks() {
		if _, ok := pollWeights[task.DefaultPriority]; !ok {
			t.Errorf("%s runs on %q, which the server does not poll", task.Name, task.DefaultPriority)
		}
	}
	for queue := range pollWeights {
		if !slices.Contains(queuescale.PriorityQueueNames, queue) {
			t.Errorf("the server polls %q, which is not one of the queues capacity scales on", queue)
		}
	}
	for _, queue := range queuescale.PriorityQueueNames {
		if _, ok := pollWeights[queue]; !ok {
			t.Errorf("capacity scales on %q, which the server does not poll", queue)
		}
	}
}
