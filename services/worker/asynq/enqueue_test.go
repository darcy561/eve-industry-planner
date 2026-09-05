package asynq

import (
	"testing"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/redisfake"

	"github.com/hibiken/asynq"
	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// streamMsg is a delivered task message. Enqueue reads only the body and the
// headers, so the rest of the interface is left to panic if anything starts
// depending on it.
type streamMsg struct {
	jetstream.Msg
	data    []byte
	headers natslib.Header
}

func (m streamMsg) Data() []byte            { return m.data }
func (m streamMsg) Headers() natslib.Header { return m.headers }
func (m streamMsg) Subject() string         { return "" }

func enqueueOne(t *testing.T, body string) (*asynq.Inspector, string) {
	t.Helper()
	fake := redisfake.New(t)
	opt := asynq.RedisClientOpt{Addr: fake.Addr()}

	client := asynq.NewClient(opt)
	t.Cleanup(func() { _ = client.Close() })

	taskType := eipnats.RefreshRegionMarketOrders.Name
	msg := streamMsg{data: []byte(body), headers: natslib.Header{}}
	if err := Enqueue(msg, client, eipnats.RefreshRegionMarketOrders); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}

	inspector := asynq.NewInspector(opt)
	t.Cleanup(func() { _ = inspector.Close() })
	return inspector, taskType
}

// The request the publisher wrote is what reaches the queue. Asynq carries the
// task type in its own field, so nothing in the payload repeats it — a wrapper
// here would be decoded as the request itself and the task would run on a
// zero-valued one.
func TestEnqueuePutsTheRequestOnTheQueueUnwrapped(t *testing.T) {
	t.Parallel()

	request := `{"region_id":10000002,"station_id":60003760}`
	inspector, taskType := enqueueOne(t, `{"type":"task","data":`+request+`}`)

	queue := eipnats.RefreshRegionMarketOrders.DefaultPriority
	tasks, err := inspector.ListPendingTasks(queue)
	if err != nil {
		t.Fatalf("ListPendingTasks(%s): %v", queue, err)
	}
	if len(tasks) != 1 {
		t.Fatalf("queued %d tasks on %s, want 1", len(tasks), queue)
	}

	got := tasks[0]
	if got.Type != taskType {
		t.Errorf("task type %q, want %q — the mux routes on this", got.Type, taskType)
	}
	if string(got.Payload) != request {
		t.Errorf("payload is\n  %s\nwant the request as published\n  %s", got.Payload, request)
	}
}

// The queue a task runs on comes from its definition, not from anything the
// publisher can set, so a task cannot talk its way onto a busier queue.
func TestEnqueueUsesTheQueueFromTheDefinition(t *testing.T) {
	t.Parallel()

	inspector, _ := enqueueOne(t, `{"type":"task","data":{"region_id":1,"station_id":2}}`)

	want := eipnats.RefreshRegionMarketOrders.DefaultPriority
	for _, queue := range []string{
		eipnats.Priority1, eipnats.Priority2, eipnats.Priority3,
		eipnats.Priority4, eipnats.Priority5,
	} {
		tasks, err := inspector.ListPendingTasks(queue)
		if err != nil {
			continue
		}
		if queue != want && len(tasks) > 0 {
			t.Errorf("%d tasks landed on %s, want them all on %s", len(tasks), queue, want)
		}
	}
}

// A bodiless trigger carries no request, and must still queue: its task type is
// the whole instruction.
func TestEnqueueQueuesATriggerWithNoRequest(t *testing.T) {
	t.Parallel()

	inspector, _ := enqueueOne(t, `{"type":"empty"}`)

	tasks, err := inspector.ListPendingTasks(eipnats.RefreshRegionMarketOrders.DefaultPriority)
	if err != nil {
		t.Fatalf("ListPendingTasks: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("queued %d tasks, want 1", len(tasks))
	}
	if len(tasks[0].Payload) != 0 {
		t.Errorf("payload is %q, want nothing", tasks[0].Payload)
	}
}

// A message that is not the shared envelope is refused rather than queued as
// whatever it happened to parse as.
func TestEnqueueRefusesAMessageThatIsNotTheEnvelope(t *testing.T) {
	t.Parallel()

	fake := redisfake.New(t)
	client := asynq.NewClient(asynq.RedisClientOpt{Addr: fake.Addr()})
	t.Cleanup(func() { _ = client.Close() })

	msg := streamMsg{data: []byte(`not json`), headers: natslib.Header{}}
	if err := Enqueue(msg, client, eipnats.RefreshRegionMarketOrders); err == nil {
		t.Fatal("an unreadable message was queued")
	}
}
