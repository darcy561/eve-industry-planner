package docker

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/client"
	"github.com/docker/go-units"

	"eve-industry-planner/admintool/internal/kit"
)

// StackSnapshot is one gather of stack services + tasks (SDK).
type StackSnapshot struct {
	Name     string
	Present  bool // at least one service with the stack namespace label
	Services map[string]ServiceInfo
}

// ServiceInfo is one Swarm service under the stack, keyed by short name.
type ServiceInfo struct {
	Short      string
	FullName   string
	Image      string            // Spec TaskTemplate image
	AppVersion string            // ContainerSpec Env APP_VERSION (expanded at deploy)
	Labels     map[string]string // merged service + container-template labels
	Desired    uint64
	Running    uint64 // desired-state=Running and CurrentState=Running
	Starting   uint64 // desired-state=Running and still provisioning
	Ports      string // friendly published host ports
	Tasks      []TaskInfo

	HasFailedDesired bool
	HasHealthcheck   bool
	TaskHealths      []string // set when loaded with health enrichment
}

// TaskInfo is one task row for status detail lines.
type TaskInfo struct {
	Name         string
	DesiredState string
	CurrentState string
	Error        string
}

// ResolveStackName returns EIP_STACK_NAME or kit.StackName.
func ResolveStackName() string {
	if v := strings.TrimSpace(os.Getenv("EIP_STACK_NAME")); v != "" {
		return v
	}
	return kit.StackName
}

// LoadStackSnapshot lists services/tasks for the stack namespace (no healthchecks).
func LoadStackSnapshot(ctx context.Context, cli client.APIClient, stackName string) (StackSnapshot, error) {
	return loadStackSnapshot(ctx, cli, stackName, false)
}

// LoadStackSnapshotWithHealth is LoadStackSnapshot plus container health inspect
// for services that declare a healthcheck and already meet desired running count.
func LoadStackSnapshotWithHealth(ctx context.Context, cli client.APIClient, stackName string) (StackSnapshot, error) {
	return loadStackSnapshot(ctx, cli, stackName, true)
}

func loadStackSnapshot(ctx context.Context, cli client.APIClient, stackName string, withHealth bool) (StackSnapshot, error) {
	if stackName == "" {
		stackName = ResolveStackName()
	}
	out := StackSnapshot{
		Name:     stackName,
		Services: map[string]ServiceInfo{},
	}
	f := StackNamespaceFilter(stackName)

	services, err := cli.ServiceList(ctx, types.ServiceListOptions{Filters: f, Status: true})
	if err != nil {
		return out, fmt.Errorf("service list: %w", err)
	}
	if len(services) == 0 {
		return out, nil
	}
	out.Present = true

	tasks, err := cli.TaskList(ctx, types.TaskListOptions{Filters: f})
	if err != nil {
		return out, fmt.Errorf("task list: %w", err)
	}
	byService := map[string][]swarm.Task{}
	for _, t := range tasks {
		byService[t.ServiceID] = append(byService[t.ServiceID], t)
	}

	prefix := stackName + "_"
	for _, svc := range services {
		full := svc.Spec.Name
		short := strings.TrimPrefix(full, prefix)
		if short == full {
			short = full
		}
		info := ServiceInfo{
			Short:          short,
			FullName:       full,
			Labels:         mergeServiceLabels(svc),
			HasHealthcheck: hasHealthcheck(svc),
		}
		if cs := svc.Spec.TaskTemplate.ContainerSpec; cs != nil {
			info.Image = cs.Image
			info.AppVersion = envValue(cs.Env, "APP_VERSION")
		}
		if svc.ServiceStatus != nil {
			info.Desired = svc.ServiceStatus.DesiredTasks
			info.Running = svc.ServiceStatus.RunningTasks
		}
		var pubs []uint32
		for _, p := range svc.Endpoint.Ports {
			if p.PublishedPort > 0 {
				pubs = append(pubs, p.PublishedPort)
			}
		}
		info.Ports = FriendlyPorts(pubs)

		svcTasks := byService[svc.ID]
		if len(svcTasks) > 0 {
			info.Running = 0
			info.Starting = 0
		}
		for _, t := range svcTasks {
			info.Tasks = append(info.Tasks, TaskInfo{
				Name:         taskDisplayName(t, full),
				DesiredState: string(t.DesiredState),
				CurrentState: formatTaskCurrentState(t),
				Error:        strings.TrimSpace(t.Status.Err),
			})
			if t.DesiredState != swarm.TaskStateRunning {
				continue
			}
			switch t.Status.State {
			case swarm.TaskStateRunning:
				info.Running++
			case swarm.TaskStatePreparing, swarm.TaskStateStarting, swarm.TaskStatePending,
				swarm.TaskStateAssigned, swarm.TaskStateAccepted, swarm.TaskStateReady:
				info.Starting++
			case swarm.TaskStateFailed, swarm.TaskStateRejected:
				info.HasFailedDesired = true
			}
		}

		if withHealth && info.HasHealthcheck && info.Desired > 0 && info.Running >= info.Desired {
			for _, t := range svcTasks {
				if t.Status.State != swarm.TaskStateRunning {
					continue
				}
				if h := containerHealth(ctx, cli, t); h != "" {
					info.TaskHealths = append(info.TaskHealths, h)
				}
			}
		}
		out.Services[short] = info
	}
	return out, nil
}

// Scores builds RollupHealth inputs from live membership.
func (s StackSnapshot) Scores() []ServiceScore {
	if !s.Present {
		return nil
	}
	out := make([]ServiceScore, 0, len(s.Services))
	for _, svc := range s.Services {
		out = append(out, ServiceScore{
			Desired:          svc.Desired,
			Running:          svc.Running,
			HasFailedDesired: svc.HasFailedDesired,
			TaskHealths:      svc.TaskHealths,
		})
	}
	return out
}

// preferredAppVersionRoles are checked first for DeployedAppVersion.
var preferredAppVersionRoles = []string{"api", "frontend", "core", "websocket", "worker"}

// DeployedAppVersion returns APP_VERSION from a running stack service env.
// Prefers elastic app roles; falls back to a semver-like image tag when env is absent.
func (s StackSnapshot) DeployedAppVersion() string {
	if !s.Present {
		return ""
	}
	for _, name := range preferredAppVersionRoles {
		if info, ok := s.Services[name]; ok {
			if v := strings.TrimSpace(info.AppVersion); v != "" {
				return v
			}
		}
	}
	for _, info := range s.Services {
		if v := strings.TrimSpace(info.AppVersion); v != "" {
			return v
		}
	}
	for _, name := range preferredAppVersionRoles {
		if info, ok := s.Services[name]; ok {
			if v := semverishImageTag(info.Image); v != "" {
				return v
			}
		}
	}
	return ""
}

func envValue(env []string, key string) string {
	prefix := key + "="
	for _, e := range env {
		if strings.HasPrefix(e, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(e, prefix))
		}
	}
	return ""
}

// semverishImageTag returns repo:tag's tag when it looks like an app version
// (e.g. 0.8.23), not a bake/local digest tag.
func semverishImageTag(image string) string {
	image = strings.TrimSpace(image)
	if image == "" {
		return ""
	}
	image, _, _ = strings.Cut(image, "@")
	i := strings.LastIndex(image, ":")
	if i < 0 || i == len(image)-1 {
		return ""
	}
	tag := strings.TrimSpace(image[i+1:])
	if tag == "" || tag == "latest" {
		return ""
	}
	tag = strings.TrimPrefix(tag, "v")
	parts := strings.Split(tag, ".")
	if len(parts) < 2 {
		return ""
	}
	for _, p := range parts {
		if p == "" {
			return ""
		}
	}
	return tag
}

// HealthSummary is worst-wins light + "N/M services up" detail.
func (s StackSnapshot) HealthSummary() (HealthLight, string) {
	if !s.Present {
		return HealthRed, "no stack services"
	}
	scores := s.Scores()
	light := RollupHealth(scores)
	scored, runningOK := 0, 0
	for _, sc := range scores {
		if sc.Desired == 0 {
			continue
		}
		scored++
		if sc.Running >= sc.Desired {
			runningOK++
		}
	}
	detail := fmt.Sprintf("%d services", len(s.Services))
	if scored > 0 {
		detail = fmt.Sprintf("%d/%d services up", runningOK, scored)
	}
	return light, detail
}

// mergeServiceLabels copies Spec.Labels and ContainerSpec.Labels (deploy stamps both).
func mergeServiceLabels(svc swarm.Service) map[string]string {
	out := map[string]string{}
	for k, v := range svc.Spec.Labels {
		out[k] = v
	}
	if cs := svc.Spec.TaskTemplate.ContainerSpec; cs != nil {
		for k, v := range cs.Labels {
			out[k] = v
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func taskDisplayName(t swarm.Task, fullService string) string {
	if t.Name != "" {
		return t.Name
	}
	if t.Slot > 0 {
		return fmt.Sprintf("%s.%d.%s", fullService, t.Slot, shortID(t.ID))
	}
	return fullService + "." + shortID(t.ID)
}

// formatTaskCurrentState matches docker stack ps {{.CurrentState}} ("Running 2 hours ago").
func formatTaskCurrentState(t swarm.Task) string {
	state := string(t.Status.State)
	if state == "" {
		return ""
	}
	state = strings.ToUpper(state[:1]) + state[1:]
	ts := t.Status.Timestamp
	if ts.IsZero() {
		return state
	}
	return fmt.Sprintf("%s %s ago", state, units.HumanDuration(time.Since(ts)))
}

func shortID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}
