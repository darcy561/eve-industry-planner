package capsoak

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	natscore "eve-industry-planner/shared/core/nats"

	"github.com/moby/moby/api/types/swarm"
	"github.com/moby/moby/client"
	natslib "github.com/nats-io/nats.go"
)

const healthPingWait = 1500 * time.Millisecond

// Shape is a point-in-time replica observation.
type Shape struct {
	Desired int // Swarm desired when Docker available; else -1
	Running int // running tasks (Docker) or health responders (NATS)
	Source  string
}

// Observer reads desired/running for a stack service.
type Observer struct {
	Stack  string
	NATS   *natslib.Conn
	Docker *client.Client // optional
}

// Close releases the Docker client if present.
func (o *Observer) Close() {
	if o != nil && o.Docker != nil {
		_ = o.Docker.Close()
	}
}

// NewObserver connects optional Docker (DOCKER_HOST) and uses NATS for health counts.
func NewObserver(stack string, nc *natslib.Conn) (*Observer, error) {
	o := &Observer{Stack: stack, NATS: nc}
	if host := strings.TrimSpace(os.Getenv("DOCKER_HOST")); host != "" {
		api, err := client.New(client.FromEnv, client.WithHost(host), client.WithTimeout(30*time.Second))
		if err != nil {
			return nil, fmt.Errorf("docker: %w", err)
		}
		o.Docker = api
	}
	return o, nil
}

func (o *Observer) serviceName(role string) string {
	return o.Stack + "_" + role
}

// ObserveWorker returns worker shape.
func (o *Observer) ObserveWorker(ctx context.Context) (Shape, error) {
	return o.observe(ctx, "worker", "worker")
}

// ObserveWebsocket returns websocket shape.
func (o *Observer) ObserveWebsocket(ctx context.Context) (Shape, error) {
	return o.observe(ctx, "websocket", "websocket")
}

func (o *Observer) observe(ctx context.Context, role, healthRole string) (Shape, error) {
	sh := Shape{Desired: -1, Source: "nats-health"}
	if o.Docker != nil {
		name := o.serviceName(role)
		insp, err := o.Docker.ServiceInspect(ctx, name, client.ServiceInspectOptions{})
		if err != nil {
			return sh, fmt.Errorf("inspect %s: %w", name, err)
		}
		if insp.Service.Spec.Mode.Replicated != nil && insp.Service.Spec.Mode.Replicated.Replicas != nil {
			sh.Desired = int(*insp.Service.Spec.Mode.Replicated.Replicas)
		}
		running, err := countRunningTasks(ctx, o.Docker, insp.Service.ID)
		if err != nil {
			return sh, err
		}
		sh.Running = running
		sh.Source = "docker"
		return sh, nil
	}
	n, err := countHealth(ctx, o.NATS, healthRole)
	if err != nil {
		return sh, err
	}
	sh.Running = n
	return sh, nil
}

func countRunningTasks(ctx context.Context, api *client.Client, serviceID string) (int, error) {
	f := make(client.Filters)
	f.Add("service", serviceID)
	f.Add("desired-state", "running")
	list, err := api.TaskList(ctx, client.TaskListOptions{Filters: f})
	if err != nil {
		return 0, err
	}
	n := 0
	for _, t := range list.Items {
		if t.Status.State == swarm.TaskStateRunning {
			n++
		}
	}
	return n, nil
}

func countHealth(ctx context.Context, nc *natslib.Conn, role string) (int, error) {
	if nc == nil || !nc.IsConnected() {
		return 0, fmt.Errorf("nats not connected")
	}
	inbox := natslib.NewInbox()
	sub, err := nc.SubscribeSync(inbox)
	if err != nil {
		return 0, err
	}
	defer func() { _ = sub.Unsubscribe() }()

	payload, _ := json.Marshal(natscore.HealthPing{})
	if err := nc.PublishRequest(natscore.SubjectHealthCommandPing, inbox, payload); err != nil {
		return 0, err
	}

	deadline := time.Now().Add(healthPingWait)
	n := 0
	for time.Now().Before(deadline) {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			break
		}
		msg, err := sub.NextMsg(remaining)
		if err != nil {
			break
		}
		st, ok := decodeHealth(msg.Data)
		if !ok || st.Role != role {
			continue
		}
		if st.Healthy || st.Ready {
			n++
		}
	}
	_ = ctx
	return n, nil
}

func decodeHealth(data []byte) (natscore.HealthStatus, bool) {
	var env natscore.Message
	if err := json.Unmarshal(data, &env); err == nil && env.Type != "" {
		var st natscore.HealthStatus
		if len(env.Data) == 0 {
			return st, false
		}
		if err := json.Unmarshal(env.Data, &st); err != nil {
			return st, false
		}
		return st, true
	}
	var st natscore.HealthStatus
	if err := json.Unmarshal(data, &st); err != nil {
		return st, false
	}
	return st, st.Role != ""
}

// EffectiveReplicas prefers Desired when known, else Running.
func (s Shape) EffectiveReplicas() int {
	if s.Desired >= 0 {
		return s.Desired
	}
	return s.Running
}
