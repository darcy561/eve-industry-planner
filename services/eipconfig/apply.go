package eipconfig

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

// ApplyTarget maps operator YAML service key → Swarm service name.
// Membership comes from stack deploy label eip.capacity.sync=1 (see DiscoverCapacitySyncTargets).
type ApplyTarget struct {
	YAMLKey      string
	SwarmService string
}

// DesiredService is the slice of stack state make swarm-sync may mutate.
type DesiredService struct {
	SwarmService string
	Replicas     uint64
	CapacityMin  string
	CapacityMax  string
	Env          map[string]string // only keys we own
}

// Change describes one field that differs live vs desired.
type Change struct {
	Field string
	From  string
	To    string
}

// DesiredFromConfig builds apply targets for services labeled eip.capacity.sync=1.
// targets come from DiscoverCapacitySyncTargets (stack YAML). Missing operator YAML keys are skipped.
func (c Config) DesiredFromConfig(targets []ApplyTarget) []DesiredService {
	out := make([]DesiredService, 0, len(targets))
	for _, t := range targets {
		s, ok := c.Services[t.YAMLKey]
		if !ok {
			fmt.Printf("skip %s: no services.%s in operator YAML\n", t.SwarmService, t.YAMLKey)
			continue
		}
		d := DesiredService{
			SwarmService: t.SwarmService,
			Replicas:     uint64(s.Min),
			CapacityMin:  itoa(s.Min),
			CapacityMax:  itoa(s.Max),
			Env:          map[string]string{},
		}
		switch t.YAMLKey {
		case "websocket":
			d.Env["WS_SLOT_CLIENT_CUTOFF"] = itoa(s.ClientCutoff)
		case "worker":
			d.Env["WORKER_ASYNQ_CONCURRENCY"] = itoa(s.Concurrency)
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

// DiffService returns changes needed to move live → desired. Empty = no-op (no roll).
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
		ch = append(ch, Change{Field: "label:eip.capacity.min", From: live.CapacityMin, To: desire.CapacityMin})
	}
	if live.CapacityMax != desire.CapacityMax {
		ch = append(ch, Change{Field: "label:eip.capacity.max", From: live.CapacityMax, To: desire.CapacityMax})
	}
	for k, want := range desire.Env {
		got := live.Env[k]
		if got != want {
			ch = append(ch, Change{Field: "env:" + k, From: got, To: want})
		}
	}
	return ch
}

// InspectService reads live Swarm state via docker CLI.
func InspectService(name string) (LiveService, error) {
	cmd := exec.Command("docker", "service", "inspect", name, "--format", "{{json .}}")
	out, err := cmd.Output()
	if err != nil {
		return LiveService{}, fmt.Errorf("docker service inspect %s: %w", name, err)
	}
	var raw swarmInspect
	if err := json.Unmarshal(out, &raw); err != nil {
		return LiveService{}, fmt.Errorf("parse inspect %s: %w", name, err)
	}
	live := LiveService{
		Env:         parseEnvList(raw.Spec.TaskTemplate.ContainerSpec.Env),
		CapacityMin: raw.Spec.Labels["eip.capacity.min"],
		CapacityMax: raw.Spec.Labels["eip.capacity.max"],
	}
	if raw.Spec.Mode.Replicated != nil && raw.Spec.Mode.Replicated.Replicas != nil {
		live.Replicas = *raw.Spec.Mode.Replicated.Replicas
	}
	return live, nil
}

// ApplyServiceUpdate runs docker service update for the given changes only.
// Label-only updates typically avoid task rebuild; env changes roll that service alone;
// replica changes scale without rewriting sibling services.
func ApplyServiceUpdate(desire DesiredService, changes []Change, dryRun bool) error {
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
		short := strings.TrimPrefix(desire.SwarmService, "eip_")
		args = append(args,
			"--label-add", "eip.capacity.service="+short,
			"--label-add", "eip.capacity.min="+desire.CapacityMin,
			"--label-add", "eip.capacity.max="+desire.CapacityMax,
		)
	}
	for k := range envKeys {
		args = append(args, "--env-add", k+"="+desire.Env[k])
	}
	args = append(args, desire.SwarmService)

	if dryRun {
		fmt.Printf("dry-run: docker %s\n", strings.Join(args, " "))
		return nil
	}
	cmd := exec.Command("docker", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker %s: %w\n%s", strings.Join(args, " "), err, string(out))
	}
	fmt.Printf("updated %s\n", desire.SwarmService)
	if msg := strings.TrimSpace(string(out)); msg != "" && msg != desire.SwarmService {
		fmt.Println(msg)
	}
	return nil
}

// ApplyConfig diffs live Swarm services and updates only what changed.
// Capacity targets: stack services with eip.capacity.sync=1 (not eip.capacity.* alone — ws-router has those).
// Also applies Traefik host publish + dashboard path, and Grafana path (Compose) when needed.
// Missing Swarm services are skipped (not an error).
func ApplyConfig(cfg Config, dryRun bool) error {
	stackPath := ResolveStackPath(AppStackFile())
	targets, err := DiscoverCapacitySyncTargets(stackPath)
	if err != nil {
		return err
	}
	if len(targets) == 0 {
		fmt.Printf("capacity sync: no services with eip.capacity.sync=1 in %s\n", stackPath)
	}
	desired := cfg.DesiredFromConfig(targets)
	var updated, skipped, missing int
	for _, d := range desired {
		live, err := InspectService(d.SwarmService)
		if err != nil {
			fmt.Printf("skip %s (not deployed)\n", d.SwarmService)
			missing++
			continue
		}
		changes := DiffService(live, d)
		if len(changes) == 0 {
			fmt.Printf("unchanged %s\n", d.SwarmService)
			skipped++
			continue
		}
		fmt.Printf("plan %s:\n", d.SwarmService)
		for _, c := range changes {
			from := c.From
			if from == "" {
				from = "(unset)"
			}
			fmt.Printf("  %s: %s -> %s\n", c.Field, from, c.To)
		}
		if err := ApplyServiceUpdate(d, changes, dryRun); err != nil {
			return err
		}
		updated++
	}
	fmt.Printf("capacity sync apply: updated=%d unchanged=%d not_deployed=%d\n", updated, skipped, missing)

	if err := ApplyTraefikConfig(cfg, dryRun); err != nil {
		return err
	}
	if err := ApplyGrafanaPath(cfg, dryRun); err != nil {
		return err
	}
	return nil
}
