package config

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/containerd/errdefs"
	swarmtypes "github.com/moby/moby/api/types/swarm"
	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/stack"
)

// DesiredService is the slice of stack state eip sync may mutate for capacity.
type DesiredService struct {
	SwarmService string
	Replicas     uint64
	CapacityMin  string
	CapacityMax  string
	Env          map[string]string // capacity env keys declared on the stack service
}

// Change describes one field that differs live vs desired.
type Change struct {
	Field string
	From  string
	To    string
}

// DesiredFromConfig builds apply targets for capacity-sync services.
// Missing operator YAML keys are skipped.
// Env keys are only set when the stack service declares them (stack SoT).
func (c Config) DesiredFromConfig(targets []stack.CapacityTarget, appDoc stack.Doc) []DesiredService {
	out := make([]DesiredService, 0, len(targets))
	for _, t := range targets {
		s, ok := c.Services[t.YAMLKey]
		if !ok {
			msg.Line(fmt.Sprintf("skip %s: no services.%s in operator YAML", t.SwarmService, t.YAMLKey))
			continue
		}
		d := DesiredService{
			SwarmService: t.SwarmService,
			Replicas:     uint64(s.Min),
			CapacityMin:  itoa(s.Min),
			CapacityMax:  itoa(s.Max),
			Env:          map[string]string{},
		}
		svc := appDoc.Services[t.Service]
		switch t.YAMLKey {
		case "websocket":
			if stack.HasEnvironmentKey(svc, stack.EnvWSSlotClientCutoff) {
				d.Env[stack.EnvWSSlotClientCutoff] = itoa(s.ClientCutoff)
			}
		case "worker":
			if stack.HasEnvironmentKey(svc, stack.EnvWorkerAsynqConcurrency) {
				d.Env[stack.EnvWorkerAsynqConcurrency] = itoa(s.Concurrency)
			}
		}
		out = append(out, d)
	}
	return out
}

// LiveService is the relevant subset of a running Swarm service.
type LiveService struct {
	Replicas    uint64
	CapacityMin string
	CapacityMax string
	Env         map[string]string
}

func parseEnvList(env []string) map[string]string {
	out := map[string]string{}
	for _, e := range env {
		k, v, ok := strings.Cut(e, "=")
		if !ok {
			continue
		}
		out[k] = v
	}
	return out
}

// DiffService returns changes needed to move live → desired. Empty = no-op.
func DiffService(live LiveService, desire DesiredService) []Change {
	var ch []Change
	if live.Replicas != desire.Replicas {
		ch = append(ch, Change{
			Field: "replicas",
			From:  strconv.FormatUint(live.Replicas, 10),
			To:    strconv.FormatUint(desire.Replicas, 10),
		})
	}
	if live.CapacityMin != desire.CapacityMin {
		ch = append(ch, Change{Field: "label:" + stack.LabelCapacityMin, From: live.CapacityMin, To: desire.CapacityMin})
	}
	if live.CapacityMax != desire.CapacityMax {
		ch = append(ch, Change{Field: "label:" + stack.LabelCapacityMax, From: live.CapacityMax, To: desire.CapacityMax})
	}
	for k, want := range desire.Env {
		got := live.Env[k]
		if got != want {
			ch = append(ch, Change{Field: "env:" + k, From: got, To: want})
		}
	}
	return ch
}

func inspectService(ctx context.Context, apiClient *client.Client, name string) (LiveService, error) {
	result, err := apiClient.ServiceInspect(ctx, name, client.ServiceInspectOptions{})
	if err != nil {
		// Preserve errdefs classification for callers (IsNotFound → skip).
		return LiveService{}, err
	}
	return liveService(result.Service), nil
}

func liveService(service swarmtypes.Service) LiveService {
	live := LiveService{
		Env:         map[string]string{},
		CapacityMin: service.Spec.Labels[stack.LabelCapacityMin],
		CapacityMax: service.Spec.Labels[stack.LabelCapacityMax],
	}
	if container := service.Spec.TaskTemplate.ContainerSpec; container != nil {
		live.Env = parseEnvList(container.Env)
	}
	if service.Spec.Mode.Replicated != nil && service.Spec.Mode.Replicated.Replicas != nil {
		live.Replicas = *service.Spec.Mode.Replicated.Replicas
	}
	return live
}

func applyServiceUpdate(ctx context.Context, apiClient *client.Client, desire DesiredService, changes []Change, dryRun bool) error {
	if len(changes) == 0 {
		return nil
	}
	needReplicas := false
	needLabels := false
	env := map[string]string{}
	for _, c := range changes {
		switch {
		case c.Field == "replicas":
			needReplicas = true
		case strings.HasPrefix(c.Field, "label:"):
			needLabels = true
		case strings.HasPrefix(c.Field, "env:"):
			key := strings.TrimPrefix(c.Field, "env:")
			if v, ok := desire.Env[key]; ok {
				env[key] = v
			}
		}
	}

	patch := ServiceSpecPatch{
		ServiceName: desire.SwarmService,
		Env:         env,
	}
	if needLabels {
		short := desire.SwarmService
		if i := strings.Index(desire.SwarmService, "_"); i >= 0 {
			short = desire.SwarmService[i+1:]
		}
		patch.Labels = map[string]string{
			stack.LabelCapacityService: short,
			stack.LabelCapacityMin:     desire.CapacityMin,
			stack.LabelCapacityMax:     desire.CapacityMax,
		}
	}
	if needReplicas {
		replicas := desire.Replicas
		patch.Mutate = func(spec *swarmtypes.ServiceSpec) error {
			if spec.Mode.Replicated == nil {
				spec.Mode.Replicated = &swarmtypes.ReplicatedService{}
			}
			spec.Mode.Replicated.Replicas = &replicas
			return nil
		}
	}
	return ApplyServiceSpecPatch(ctx, apiClient, patch, dryRun)
}

func setEnv(env []string, values map[string]string, keys map[string]struct{}) []string {
	out := make([]string, 0, len(env)+len(keys))
	for _, item := range env {
		key, _, ok := strings.Cut(item, "=")
		if !ok {
			out = append(out, item)
			continue
		}
		if _, replace := keys[key]; replace {
			out = append(out, key+"="+values[key])
			delete(keys, key)
			continue
		}
		out = append(out, item)
	}
	for key := range keys {
		out = append(out, key+"="+values[key])
	}
	return out
}

// ApplyCapacity diffs live Swarm capacity-sync services and updates only what changed.
// Missing Swarm services are skipped.
func ApplyCapacity(ctx context.Context, cfg Config, targets []stack.CapacityTarget, appDoc stack.Doc, dryRun bool) error {
	apiClient, err := docker.NewAPIClient(client.WithTimeout(2 * time.Minute))
	if err != nil {
		return fmt.Errorf("capacity sync: engine API client: %w", err)
	}
	defer apiClient.Close()
	return applyCapacity(ctx, apiClient, cfg, targets, appDoc, dryRun)
}

func applyCapacity(ctx context.Context, apiClient *client.Client, cfg Config, targets []stack.CapacityTarget, appDoc stack.Doc, dryRun bool) error {
	if len(targets) == 0 {
		msg.Line("capacity sync: no services with eip.capacity.sync=1")
		return nil
	}
	desired := cfg.DesiredFromConfig(targets, appDoc)
	var updated, skipped, missing int
	for _, d := range desired {
		live, err := inspectService(ctx, apiClient, d.SwarmService)
		if err != nil {
			if errdefs.IsNotFound(err) {
				msg.Line(fmt.Sprintf("skip %s (not deployed)", d.SwarmService))
				missing++
				continue
			}
			return fmt.Errorf("inspect service %s: %w", d.SwarmService, err)
		}
		changes := DiffService(live, d)
		if len(changes) == 0 {
			msg.Line("unchanged " + d.SwarmService)
			skipped++
			continue
		}
		msg.Line("plan " + d.SwarmService + ":")
		for _, c := range changes {
			from := c.From
			if from == "" {
				from = "(unset)"
			}
			msg.Line(fmt.Sprintf("  %s: %s -> %s", c.Field, from, c.To))
		}
		if err := applyServiceUpdate(ctx, apiClient, d, changes, dryRun); err != nil {
			return err
		}
		updated++
	}
	msg.Line(fmt.Sprintf("capacity sync apply: updated=%d unchanged=%d not_deployed=%d", updated, skipped, missing))
	return nil
}
