package config

import (
	"context"
	"fmt"

	swarmtypes "github.com/moby/moby/api/types/swarm"
	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/msg"
)

// ServiceSpecPatch is a reusable Swarm service mutation for day-2 apply paths.
// Domain code builds desired labels/env; this owns inspect → merge → ServiceUpdate.
type ServiceSpecPatch struct {
	ServiceName string
	Labels      map[string]string // merged into Spec.Labels
	Env         map[string]string // container env keys to set
	EnvUnset    []string          // container env keys to remove
	// Mutate runs after labels/env (ports, replicas, …). Optional.
	Mutate func(spec *swarmtypes.ServiceSpec) error
}

// ApplyServiceSpecPatch updates one Swarm service from patch. No-op fields may be nil/empty.
// Missing service → error (callers that skip-not-found inspect first).
func ApplyServiceSpecPatch(ctx context.Context, apiClient *client.Client, patch ServiceSpecPatch, dryRun bool) error {
	name := patch.ServiceName
	if name == "" {
		return fmt.Errorf("service patch: empty service name")
	}
	if dryRun {
		msg.Line("dry-run: would update " + name)
		return nil
	}
	result, err := apiClient.ServiceInspect(ctx, name, client.ServiceInspectOptions{})
	if err != nil {
		return fmt.Errorf("inspect service %s: %w", name, err)
	}
	spec := result.Service.Spec
	if len(patch.Labels) > 0 {
		if spec.Labels == nil {
			spec.Labels = map[string]string{}
		}
		mergeStringMap(spec.Labels, patch.Labels)
	}
	needEnv := len(patch.Env) > 0 || len(patch.EnvUnset) > 0
	if needEnv {
		if spec.TaskTemplate.ContainerSpec == nil {
			return fmt.Errorf("update service %s: missing ContainerSpec", name)
		}
		env := spec.TaskTemplate.ContainerSpec.Env
		if len(patch.EnvUnset) > 0 {
			keys := map[string]struct{}{}
			for _, k := range patch.EnvUnset {
				keys[k] = struct{}{}
			}
			env = removeEnv(env, keys)
		}
		if len(patch.Env) > 0 {
			keys := map[string]struct{}{}
			for k := range patch.Env {
				keys[k] = struct{}{}
			}
			env = setEnv(env, patch.Env, keys)
		}
		spec.TaskTemplate.ContainerSpec.Env = env
	}
	if patch.Mutate != nil {
		if err := patch.Mutate(&spec); err != nil {
			return err
		}
	}
	if _, err := apiClient.ServiceUpdate(ctx, result.Service.ID, client.ServiceUpdateOptions{
		Version: result.Service.Version,
		Spec:    spec,
	}); err != nil {
		return fmt.Errorf("update service %s: %w", name, err)
	}
	msg.Line("updated " + name)
	return nil
}

func mergeStringMap(dst, src map[string]string) {
	for k, v := range src {
		dst[k] = v
	}
}
