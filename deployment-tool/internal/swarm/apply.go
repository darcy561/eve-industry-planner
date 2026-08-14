package swarm

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/containerd/errdefs"
	swarmtypes "github.com/moby/moby/api/types/swarm"
	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/stack"
)

// ApplyConfigs mount-rolls hash-diff config objects onto running services via
// Moby ServiceInspect / ConfigInspect / ServiceUpdate (not `docker service update`).
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

	apiClient, err := docker.NewAPIClient(client.WithTimeout(2 * time.Minute))
	if err != nil {
		return fmt.Errorf("apply configs: engine API client: %w", err)
	}
	defer apiClient.Close()

	var updated, skipped, missing int
	for _, m := range mounts {
		raw, err := resolveBytes(home, m.File)
		if err != nil {
			return fmt.Errorf("config %s: %w", m.Key, err)
		}
		obj := Name(m.Key, raw)
		swarmSvc := stackPrefix + "_" + m.Service

		service, err := apiClient.ServiceInspect(ctx, swarmSvc, client.ServiceInspectOptions{})
		exists := err == nil
		if err != nil && !errdefs.IsNotFound(err) {
			return fmt.Errorf("inspect service %s: %w", swarmSvc, err)
		}
		var liveName string
		if exists {
			liveName = liveConfigName(service.Service, m.Key, m.Target)
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

		if _, err := ensureConfig(ctx, apiClient, m.Key, raw); err != nil {
			return err
		}
		// Re-inspect: grafana (etc.) may roll many mounts; Version must be current.
		fresh, err := apiClient.ServiceInspect(ctx, swarmSvc, client.ServiceInspectOptions{})
		if err != nil {
			return fmt.Errorf("inspect service %s: %w", swarmSvc, err)
		}
		liveName = liveConfigName(fresh.Service, m.Key, m.Target)
		if err := rollServiceConfig(ctx, apiClient, fresh.Service, liveName, obj, m.Target); err != nil {
			return fmt.Errorf("update configs on %s: %w", swarmSvc, err)
		}
		msg.Line(fmt.Sprintf("updated %s (config %s)", swarmSvc, m.Key))
		pruneOldConfigs(ctx, apiClient, m.Key, obj)
		updated++
	}

	msg.Line(fmt.Sprintf("config sync apply: updated=%d unchanged=%d not_deployed=%d", updated, skipped, missing))
	return nil
}

func pruneOldConfigs(ctx context.Context, apiClient *client.Client, key, keep string) {
	configs, err := apiClient.ConfigList(ctx, client.ConfigListOptions{})
	if err != nil {
		return
	}
	names := make([]string, 0, len(configs.Items))
	for _, config := range configs.Items {
		names = append(names, config.Spec.Name)
	}
	for _, name := range supersededObjectNames(names, key, keep) {
		if _, err := apiClient.ConfigRemove(ctx, name, client.ConfigRemoveOptions{}); err == nil {
			msg.Line("pruned superseded docker config " + name)
		}
	}
}

func liveConfigName(service swarmtypes.Service, key, target string) string {
	container := service.Spec.TaskTemplate.ContainerSpec
	if container == nil {
		return ""
	}
	for _, ref := range container.Configs {
		if ref == nil {
			continue
		}
		if ref.File != nil && ref.File.Name == target {
			return ref.ConfigName
		}
	}
	prefix := "eip_" + key + "_"
	for _, ref := range container.Configs {
		if ref == nil {
			continue
		}
		if strings.HasPrefix(ref.ConfigName, prefix) {
			return ref.ConfigName
		}
	}
	return ""
}

func rollServiceConfig(ctx context.Context, apiClient *client.Client, service swarmtypes.Service, liveName, configName, target string) error {
	config, err := apiClient.ConfigInspect(ctx, configName, client.ConfigInspectOptions{})
	if err != nil {
		return fmt.Errorf("inspect config %s: %w", configName, err)
	}

	spec := service.Spec
	container := spec.TaskTemplate.ContainerSpec
	if container == nil {
		return fmt.Errorf("service %s: missing ContainerSpec", service.Spec.Name)
	}

	file := &swarmtypes.ConfigReferenceFileTarget{
		Name: target,
		UID:  "0",
		GID:  "0",
		Mode: os.FileMode(0o444),
	}
	configs := make([]*swarmtypes.ConfigReference, 0, len(container.Configs)+1)
	for _, ref := range container.Configs {
		if ref == nil {
			continue
		}
		matchesLive := liveName != "" && ref.ConfigName == liveName
		matchesTarget := ref.File != nil && ref.File.Name == target
		if !matchesLive && !matchesTarget {
			configs = append(configs, ref)
			continue
		}
		if ref.File != nil {
			file.UID = ref.File.UID
			file.GID = ref.File.GID
			file.Mode = ref.File.Mode
		}
	}
	container.Configs = append(configs, &swarmtypes.ConfigReference{
		ConfigID:   config.Config.ID,
		ConfigName: config.Config.Spec.Name,
		File:       file,
	})
	_, err = apiClient.ServiceUpdate(ctx, service.ID, client.ServiceUpdateOptions{
		Version: service.Version,
		Spec:    spec,
	})
	return err
}
