package cluster

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/hibiken/asynq"
	swarmtypes "github.com/moby/moby/api/types/swarm"
	"github.com/moby/moby/client"
	natslib "github.com/nats-io/nats.go"
	redislib "github.com/redis/go-redis/v9"

	"eve-industry-planner/capacity-controller/config"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/tasks"
)

const (
	cooldownRedisKeyPrefix = "eip:capacity:cooldown:v1:"
	healthPingWait         = 1500 * time.Millisecond
)

// CooldownRedisKey returns the Redis key for one service's Apply hysteresis.
func CooldownRedisKey(svc Service) string {
	return cooldownRedisKeyPrefix + string(svc)
}

// SwarmOptions wires live Observe/Apply dependencies.
type SwarmOptions struct {
	Docker *client.Client
	Redis  *redislib.Client
	NATS   *natslib.Conn
	Asynq  *asynq.Inspector // optional; nil → QueueDepthKnown=false
	Stack  string           // Swarm stack name prefix, e.g. "eip"
	Cfg    func() config.Config
}

// Swarm is the production Cluster (Moby + Redis Asynq + NATS health).
type Swarm struct {
	opts SwarmOptions

	mu           sync.Mutex
	pressureUp   map[Service]time.Time
	pressureDown map[Service]time.Time
}

// NewSwarm returns a live Cluster.
func NewSwarm(opts SwarmOptions) *Swarm {
	if opts.Stack == "" {
		opts.Stack = envOr("EIP_STACK_NAME", "eip")
	}
	return &Swarm{
		opts:         opts,
		pressureUp:   map[Service]time.Time{},
		pressureDown: map[Service]time.Time{},
	}
}

func envOr(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}

func (s *Swarm) swarmServiceName(svc Service) string {
	return s.opts.Stack + "_" + string(svc)
}

// Observe builds State for all managed services (ctl status|plan).
func (s *Swarm) Observe(ctx context.Context) (State, error) {
	out := State{Services: map[Service]ServiceState{}}
	healthBySvc, _ := s.pingHealth(ctx)
	cfg := s.cfg()
	for _, svc := range ManagedServices {
		ss, err := s.observeService(ctx, svc, cfg, healthBySvc[string(svc)])
		if err != nil {
			return State{}, err
		}
		out.Services[svc] = ss
	}
	return out, nil
}

// ObserveService builds State for one managed service (per-service control loop).
func (s *Swarm) ObserveService(ctx context.Context, svc Service) (State, error) {
	healthBySvc, _ := s.pingHealth(ctx)
	ss, err := s.observeService(ctx, svc, s.cfg(), healthBySvc[string(svc)])
	if err != nil {
		return State{}, err
	}
	return State{Services: map[Service]ServiceState{svc: ss}}, nil
}

func (s *Swarm) cfg() config.Config {
	if s.opts.Cfg != nil {
		return s.opts.Cfg()
	}
	return config.Config{}
}

type cooldownBlob struct {
	LastApplyAt time.Time `json:"last_apply_at"`
}

// RecordCooldown persists last Apply time for one service.
func (s *Swarm) RecordCooldown(ctx context.Context, svc Service, at time.Time) error {
	if s.opts.Redis == nil {
		return nil
	}
	b, err := json.Marshal(cooldownBlob{LastApplyAt: at.UTC()})
	if err != nil {
		return err
	}
	return s.opts.Redis.Set(ctx, CooldownRedisKey(svc), b, 0).Err()
}

func (s *Swarm) loadCooldown(ctx context.Context, svc Service) CooldownState {
	var cd CooldownState
	if s.opts.Redis == nil {
		return cd
	}
	raw, err := s.opts.Redis.Get(ctx, CooldownRedisKey(svc)).Bytes()
	if err != nil {
		return cd
	}
	var blob cooldownBlob
	if json.Unmarshal(raw, &blob) == nil && !blob.LastApplyAt.IsZero() {
		cd.LastApplyAt = blob.LastApplyAt
	}
	return cd
}

func (s *Swarm) observeService(ctx context.Context, svc Service, cfg config.Config, health []natscore.HealthStatus) (ServiceState, error) {
	spec := cfg.Services[string(svc)]
	ss := ServiceState{
		Managed:         spec.CapacityControllerManaged,
		Min:             spec.Min,
		Max:             spec.Max,
		Concurrency:     spec.Concurrency,
		TargetClients:   spec.TargetClients,
		ReserveCapacity: spec.ReserveCapacity,
		Cooldown:        s.loadCooldown(ctx, svc),
	}
	if svc == ServiceWorker {
		ss.QueueScaleUpPct = tasks.MergeQueueScaleUpPendingPct(spec.QueueScaleUpPct)
	}

	name := s.swarmServiceName(svc)
	if s.opts.Docker != nil {
		insp, err := s.opts.Docker.ServiceInspect(ctx, name, client.ServiceInspectOptions{})
		if err != nil {
			return ServiceState{}, fmt.Errorf("observe %s: %w", name, err)
		}
		if insp.Service.Spec.Mode.Replicated != nil && insp.Service.Spec.Mode.Replicated.Replicas != nil {
			ss.DesiredReplicas = int(*insp.Service.Spec.Mode.Replicated.Replicas)
		}
		running, err := s.countRunningTasks(ctx, insp.Service.ID)
		if err != nil {
			return ServiceState{}, err
		}
		ss.Running = running
	}

	for _, h := range health {
		ss.Backends = append(ss.Backends, BackendState{
			ContainerID:       h.InstanceID,
			Clients:           h.Clients,
			Soft:              h.Soft,
			Full:              h.Full,
			Draining:          h.Draining,
			Healthy:           h.Healthy,
			Ready:             h.Ready,
			HostedTenantCount: h.HostedTenantCount,
		})
	}

	if svc == ServiceWorker {
		s.fillWorkerQueues(ctx, &ss)
	}

	s.stampPressure(svc, &ss)
	return ss, nil
}

func (s *Swarm) countRunningTasks(ctx context.Context, serviceID string) (int, error) {
	f := make(client.Filters)
	f.Add("service", serviceID)
	f.Add("desired-state", "running")
	list, err := s.opts.Docker.TaskList(ctx, client.TaskListOptions{Filters: f})
	if err != nil {
		return 0, fmt.Errorf("task list: %w", err)
	}
	n := 0
	for _, t := range list.Items {
		if t.Status.State == swarmtypes.TaskStateRunning {
			n++
		}
	}
	return n, nil
}

func (s *Swarm) fillWorkerQueues(ctx context.Context, ss *ServiceState) {
	if s.opts.Asynq == nil {
		ss.QueueDepthKnown = false
		return
	}
	names, err := s.opts.Asynq.Queues()
	if err != nil {
		ss.QueueDepthKnown = false
		return
	}
	pendingByQ := make(map[string]int, len(names))
	pending, active := 0, 0
	for _, name := range names {
		info, err := s.opts.Asynq.GetQueueInfo(name)
		if err != nil {
			ss.QueueDepthKnown = false
			return
		}
		pendingByQ[name] = info.Pending
		pending += info.Pending
		active += info.Active
	}
	ss.QueuePending = pendingByQ
	ss.QueueDepth = pending
	ss.ActiveTasks = active
	ss.QueueDepthKnown = true
	_ = ctx
}

func (s *Swarm) stampPressure(svc Service, ss *ServiceState) {
	now := time.Now().UTC()
	up, down := false, false
	switch svc {
	case ServiceWorker:
		if ss.QueueDepthKnown && ss.Concurrency > 0 && ss.Running > 0 {
			slots := ss.Concurrency * ss.Running
			if tasks.ScaleUpPressure(ss.QueuePending, slots, ss.QueueScaleUpPct) {
				up = true
			}
		}
		if ss.QueueDepthKnown && ss.QueueDepth == 0 && ss.DesiredReplicas > ss.Min {
			c := ss.Concurrency
			if c <= 0 {
				c = 1
			}
			r := ss.Running
			if r <= 0 {
				r = ss.DesiredReplicas
			}
			if r <= 1 || ss.ActiveTasks <= c*(r-1) {
				down = true
			}
		}
	case ServiceWebsocket:
		if len(ss.Backends) > 0 && ss.TargetClients > 0 {
			total := 0
			for _, b := range ss.Backends {
				total += b.Clients
			}
			avg := float64(total) / float64(len(ss.Backends))
			reserve := ss.ReserveCapacity
			if reserve < 0 {
				reserve = 0
			}
			if reserve >= 1 {
				reserve = 0.99
			}
			if avg > float64(ss.TargetClients)*(1-reserve) {
				up = true
			}
			drainingEmpty := false
			for _, b := range ss.Backends {
				if b.Draining && b.Clients == 0 {
					drainingEmpty = true
					break
				}
			}
			if drainingEmpty && avg <= float64(ss.TargetClients)*0.35 {
				down = true
			}
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if up {
		if s.pressureUp[svc].IsZero() {
			s.pressureUp[svc] = now
		}
		ss.PressureUpSince = s.pressureUp[svc]
	} else {
		s.pressureUp[svc] = time.Time{}
	}
	if down {
		if s.pressureDown[svc].IsZero() {
			s.pressureDown[svc] = now
		}
		ss.PressureDownSince = s.pressureDown[svc]
	} else {
		s.pressureDown[svc] = time.Time{}
	}
}

func (s *Swarm) pingHealth(ctx context.Context) (map[string][]natscore.HealthStatus, error) {
	out := map[string][]natscore.HealthStatus{}
	if s.opts.NATS == nil || !s.opts.NATS.IsConnected() {
		return out, nil
	}
	inbox := natslib.NewInbox()
	sub, err := s.opts.NATS.SubscribeSync(inbox)
	if err != nil {
		return out, err
	}
	defer func() { _ = sub.Unsubscribe() }()

	payload, _ := json.Marshal(natscore.HealthPing{})
	if err := s.opts.NATS.PublishRequest(natscore.SubjectHealthCommandPing, inbox, payload); err != nil {
		return out, err
	}

	deadline := time.Now().Add(healthPingWait)
	for time.Now().Before(deadline) {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			break
		}
		msg, err := sub.NextMsg(remaining)
		if err != nil {
			break
		}
		st, ok := decodeHealthStatus(msg.Data)
		if !ok {
			continue
		}
		out[st.Role] = append(out[st.Role], st)
	}
	return out, nil
}

func decodeHealthStatus(data []byte) (natscore.HealthStatus, bool) {
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

// Scale updates Swarm desired replicas for the service.
func (s *Swarm) Scale(ctx context.Context, svc Service, desired int) error {
	if s.opts.Docker == nil {
		return fmt.Errorf("scale: docker client nil")
	}
	if desired < 0 {
		return fmt.Errorf("scale: desired < 0")
	}
	name := s.swarmServiceName(svc)
	insp, err := s.opts.Docker.ServiceInspect(ctx, name, client.ServiceInspectOptions{})
	if err != nil {
		return fmt.Errorf("scale inspect %s: %w", name, err)
	}
	spec := insp.Service.Spec
	if spec.Mode.Replicated == nil {
		return fmt.Errorf("scale %s: not replicated", name)
	}
	n := uint64(desired)
	spec.Mode.Replicated.Replicas = &n
	_, err = s.opts.Docker.ServiceUpdate(ctx, insp.Service.ID, client.ServiceUpdateOptions{
		Version: insp.Service.Version,
		Spec:    spec,
	})
	if err != nil {
		return fmt.Errorf("scale update %s: %w", name, err)
	}
	return nil
}

// Cordon soft-stops a websocket backend via NATS ws.command.cordon.
func (s *Swarm) Cordon(ctx context.Context, containerID string) error {
	return s.wsCommand(ctx, natscore.SubjectWSCommandCordon, containerID, 5*time.Second)
}

// Drain kicks clients on a websocket backend via NATS ws.command.drain.
// Wait budget follows websocket PlannedDrain (lifecycle.AppStopGrace) plus NATS RTT slack.
func (s *Swarm) Drain(ctx context.Context, containerID string) error {
	return s.wsCommand(ctx, natscore.SubjectWSCommandDrain, containerID, lifecycle.AppStopGrace+5*time.Second)
}

// Uncordon clears planned soft-stop via NATS ws.command.uncordon.
func (s *Swarm) Uncordon(ctx context.Context, containerID string) error {
	return s.wsCommand(ctx, natscore.SubjectWSCommandUncordon, containerID, 5*time.Second)
}

func (s *Swarm) wsCommand(ctx context.Context, subject, containerID string, timeout time.Duration) error {
	if s.opts.NATS == nil || !s.opts.NATS.IsConnected() {
		return fmt.Errorf("%s: nats not connected", subject)
	}
	containerID = strings.TrimSpace(containerID)
	if containerID == "" {
		return fmt.Errorf("%s: empty container_id", subject)
	}
	raw, err := json.Marshal(natscore.WSCommand{ContainerID: containerID})
	if err != nil {
		return err
	}
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	msg, err := s.opts.NATS.RequestWithContext(reqCtx, subject, raw)
	if err != nil {
		return fmt.Errorf("%s %s: %w", subject, containerID, err)
	}
	ack, ok := decodeWSCommandAck(msg.Data)
	if !ok {
		return fmt.Errorf("%s %s: bad ack", subject, containerID)
	}
	if !ack.OK {
		if ack.Error != "" {
			return fmt.Errorf("%s %s: %s", subject, containerID, ack.Error)
		}
		return fmt.Errorf("%s %s: not ok", subject, containerID)
	}
	return nil
}

func decodeWSCommandAck(data []byte) (natscore.WSCommandAck, bool) {
	var env natscore.Message
	if err := json.Unmarshal(data, &env); err == nil && env.Type != "" {
		var ack natscore.WSCommandAck
		if len(env.Data) == 0 {
			return ack, false
		}
		if err := json.Unmarshal(env.Data, &ack); err != nil {
			return ack, false
		}
		return ack, true
	}
	var ack natscore.WSCommandAck
	if err := json.Unmarshal(data, &ack); err != nil {
		return ack, false
	}
	return ack, true
}
