package eipconfig

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"eve-industry-planner/admintool/internal/dockercli"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/stack"
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

type swarmInspect struct {
	Spec struct {
		Labels map[string]string `json:"Labels"`
		Mode   struct {
			Replicated *struct {
				Replicas *uint64 `json:"Replicas"`
			} `json:"Replicated"`
		} `json:"Mode"`
		TaskTemplate struct {
			ContainerSpec struct {
				Env []string `json:"Env"`
			} `json:"ContainerSpec"`
		} `json:"TaskTemplate"`
	} `json:"Spec"`
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

// InspectService reads live Swarm state via docker CLI. Missing service → error.
func InspectService(ctx context.Context, name string) (LiveService, error) {
	out, err := dockercli.TryOut(ctx, "service", "inspect", name, "--format", "{{json .}}")
	if err != nil {
		return LiveService{}, fmt.Errorf("docker service inspect %s: %w", name, err)
	}
	var raw swarmInspect
	if err := json.Unmarshal([]byte(out), &raw); err != nil {
		return LiveService{}, fmt.Errorf("parse inspect %s: %w", name, err)
	}
	live := LiveService{
		Env:         parseEnvList(raw.Spec.TaskTemplate.ContainerSpec.Env),
		CapacityMin: raw.Spec.Labels[stack.LabelCapacityMin],
		CapacityMax: raw.Spec.Labels[stack.LabelCapacityMax],
	}
	if raw.Spec.Mode.Replicated != nil && raw.Spec.Mode.Replicated.Replicas != nil {
		live.Replicas = *raw.Spec.Mode.Replicated.Replicas
	}
	return live, nil
}

// ServiceExists reports whether a Swarm service is deployed.
func ServiceExists(ctx context.Context, name string) bool {
	return dockercli.ServiceExists(ctx, name)
}

// ApplyServiceUpdate runs docker service update for the given changes only.
func ApplyServiceUpdate(ctx context.Context, desire DesiredService, changes []Change, dryRun bool) error {
	if len(changes) == 0 {
		return nil
	}
	needReplicas := false
	needLabels := false
	envKeys := map[string]struct{}{}
	for _, c := range changes {
		switch {
		case c.Field == "replicas":
			needReplicas = true
		case strings.HasPrefix(c.Field, "label:"):
			needLabels = true
		case strings.HasPrefix(c.Field, "env:"):
			envKeys[strings.TrimPrefix(c.Field, "env:")] = struct{}{}
		}
	}

	args := []string{"service", "update", "--detach=true"}
	if needReplicas {
		args = append(args, "--replicas", strconv.FormatUint(desire.Replicas, 10))
	}
	if needLabels {
		short := desire.SwarmService
		if i := strings.Index(desire.SwarmService, "_"); i >= 0 {
			short = desire.SwarmService[i+1:]
		}
		args = append(args,
			"--label-add", stack.LabelCapacityService+"="+short,
			"--label-add", stack.LabelCapacityMin+"="+desire.CapacityMin,
			"--label-add", stack.LabelCapacityMax+"="+desire.CapacityMax,
		)
	}
	for k := range envKeys {
		args = append(args, "--env-add", k+"="+desire.Env[k])
	}
	args = append(args, desire.SwarmService)

	if dryRun {
		msg.Line("dry-run: docker " + strings.Join(args, " "))
		return nil
	}
	if err := dockercli.Run(ctx, args...); err != nil {
		return err
	}
	msg.Line("updated " + desire.SwarmService)
	return nil
}

// ApplyCapacity diffs live Swarm capacity-sync services and updates only what changed.
// Missing Swarm services are skipped.
func ApplyCapacity(ctx context.Context, cfg Config, targets []stack.CapacityTarget, appDoc stack.Doc, dryRun bool) error {
	if len(targets) == 0 {
		msg.Line("capacity sync: no services with eip.capacity.sync=1")
		return nil
	}
	desired := cfg.DesiredFromConfig(targets, appDoc)
	var updated, skipped, missing int
	for _, d := range desired {
		live, err := InspectService(ctx, d.SwarmService)
		if err != nil {
			msg.Line(fmt.Sprintf("skip %s (not deployed)", d.SwarmService))
			missing++
			continue
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
		if err := ApplyServiceUpdate(ctx, d, changes, dryRun); err != nil {
			return err
		}
		updated++
	}
	msg.Line(fmt.Sprintf("capacity sync apply: updated=%d unchanged=%d not_deployed=%d", updated, skipped, missing))
	return nil
}
