package swarm

import (
	"context"
	"fmt"
	"strings"

	"eve-industry-planner/admintool/internal/dockercli"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/stack"
)

// Apply mount-rolls hash-diff config objects onto running services.
// Missing stack files are errors; missing services are skipped.
func ApplyConfigs(ctx context.Context, home, stackPrefix string, dryRun bool, stackFiles ...string) error {
	if stackPrefix == "" {
		stackPrefix = "eip"
	}
	if len(stackFiles) == 0 {
		return fmt.Errorf("Apply: no stack files")
	}

	var mounts []stack.ConfigMount
	for _, f := range stackFiles {
		p, err := resolveStackPath(home, f)
		if err != nil {
			return err
		}
		doc, err := stack.Load(p)
		if err != nil {
			return err
		}
		ms, err := stack.ConfigMounts(doc)
		if err != nil {
			return err
		}
		mounts = append(mounts, ms...)
	}

	var updated, skipped, missing int
	for _, m := range mounts {
		raw, err := resolveBytes(home, m.File)
		if err != nil {
			return fmt.Errorf("config %s: %w", m.Key, err)
		}
		obj := Name(m.Key, raw)
		swarmSvc := stackPrefix + "_" + m.Service

		exists := dockercli.ServiceExists(ctx, swarmSvc)
		var liveName string
		if exists {
			liveName, err = liveConfigName(ctx, swarmSvc, m.Key, m.Target)
			if err != nil {
				return err
			}
		}
		switch decideConfigRoll(exists, liveName, obj) {
		case configRollSkipMissing:
			msg.Line(fmt.Sprintf("skip %s (not deployed; config %s)", swarmSvc, m.Key))
			missing++
			continue
		case configRollUnchanged:
			msg.Line(fmt.Sprintf("unchanged %s (config %s)", swarmSvc, m.Key))
			skipped++
			continue
		}

		from := liveName
		if from == "" {
			from = "(none)"
		}
		msg.Line(fmt.Sprintf("plan %s: config %s: %s -> %s", swarmSvc, m.Key, from, obj))
		if dryRun {
			msg.Line(fmt.Sprintf("dry-run: would ensure %s and service update %s", obj, swarmSvc))
			updated++
			continue
		}

		if _, err := ensureConfig(ctx, m.Key, raw); err != nil {
			return err
		}

		args := []string{"service", "update", "--detach=true"}
		if liveName != "" {
			args = append(args, "--config-rm", liveName)
		}
		args = append(args, "--config-add", fmt.Sprintf("source=%s,target=%s", obj, m.Target), swarmSvc)
		if err := dockercli.Run(ctx, args...); err != nil {
			return fmt.Errorf("update configs on %s: %w", swarmSvc, err)
		}
		msg.Line(fmt.Sprintf("updated %s (config %s)", swarmSvc, m.Key))
		PruneOldConfigs(ctx, m.Key, obj)
		updated++
	}

	msg.Line(fmt.Sprintf("config sync apply: updated=%d unchanged=%d not_deployed=%d", updated, skipped, missing))
	return nil
}

// PruneOld drops older eip_<key>_* objects not listed in keep (best-effort).
func PruneOldConfigs(ctx context.Context, key, keep string) {
	out, err := dockercli.RunOut(ctx, "config", "ls", "--format", "{{.Name}}")
	if err != nil {
		return
	}
	for _, name := range supersededObjectNames(strings.Split(out, "\n"), key, keep) {
		if err := dockercli.Run(ctx, "config", "rm", name); err == nil {
			msg.Line("pruned superseded docker config " + name)
		}
	}
}

func liveConfigName(ctx context.Context, swarmSvc, key, target string) (string, error) {
	out, err := dockercli.RunOut(ctx, "service", "inspect", swarmSvc, "--format",
		`{{range .Spec.TaskTemplate.ContainerSpec.Configs}}{{.ConfigName}}	{{if .File}}{{.File.Name}}{{end}}{{"\n"}}{{end}}`)
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		name, tgt, ok := strings.Cut(line, "\t")
		if ok && tgt == target {
			return name, nil
		}
	}
	prefix := "eip_" + key + "_"
	for _, line := range strings.Split(out, "\n") {
		name := strings.TrimSpace(strings.Split(line, "\t")[0])
		if strings.HasPrefix(name, prefix) {
			return name, nil
		}
	}
	return "", nil
}
