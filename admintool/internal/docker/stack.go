package docker

import (
	"context"
	"fmt"
	"maps"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/docker/go-units"
	"github.com/moby/moby/api/types/swarm"
	"github.com/moby/moby/client"
	"golang.org/x/sync/errgroup"

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
	TaskHealths      []TaskHealth // set when loaded with health enrichment
}

// TaskInfo is one task row for status detail lines.
type TaskInfo struct {
	Name         string
	DesiredState string
	CurrentState string
	Error        string
	Image        string // ContainerSpec image (may include @digest)
}

// RunningImageDigest returns a digest from a desired-running task image, if any.
func (info ServiceInfo) RunningImageDigest() string {
	for _, t := range info.Tasks {
		if !strings.EqualFold(t.DesiredState, string(swarm.TaskStateRunning)) {
			continue
		}
		if d := digestFromImageRef(t.Image); d != "" {
			return d
		}
	}
	// Fallback: service spec image (often pinned after deploy).
	return digestFromImageRef(info.Image)
}

func digestFromImageRef(ref string) string {
	ref = strings.TrimSpace(ref)
	if i := strings.LastIndex(ref, "@"); i >= 0 && i+1 < len(ref) {
		return strings.TrimSpace(ref[i+1:])
	}
	return ""
}

// ResolveStackName returns EIP_STACK_NAME or kit.StackName.
func ResolveStackName() string {
	if v := strings.TrimSpace(os.Getenv("EIP_STACK_NAME")); v != "" {
		return v
	}
	return kit.StackName
}

// LoadStackSnapshot lists services/tasks for the stack namespace (no healthchecks).
func LoadStackSnapshot(ctx context.Context, apiClient *client.Client, stackName string) (StackSnapshot, error) {
	return loadStackSnapshot(ctx, apiClient, stackName, false)
}

// LoadStackSnapshotWithHealth is LoadStackSnapshot plus container health inspect
// for services that declare a healthcheck and already meet desired running count.
func LoadStackSnapshotWithHealth(ctx context.Context, apiClient *client.Client, stackName string) (StackSnapshot, error) {
	return loadStackSnapshot(ctx, apiClient, stackName, true)
}

func loadStackSnapshot(ctx context.Context, apiClient *client.Client, stackName string, withHealth bool) (StackSnapshot, error) {
	if stackName == "" {
		stackName = ResolveStackName()
	}
	out := StackSnapshot{
		Name:     stackName,
		Services: map[string]ServiceInfo{},
	}
	f := StackNamespaceFilter(stackName)

	services, err := apiClient.ServiceList(ctx, client.ServiceListOptions{Filters: f, Status: true})
	if err != nil {
		return out, fmt.Errorf("service list: %w", err)
	}
	if len(services.Items) == 0 {
		return out, nil
	}
	out.Present = true

	tasks, err := apiClient.TaskList(ctx, client.TaskListOptions{Filters: f})
	if err != nil {
		return out, fmt.Errorf("task list: %w", err)
	}
	byService := map[string][]swarm.Task{}
	for _, t := range tasks.Items {
		byService[t.ServiceID] = append(byService[t.ServiceID], t)
	}

	var healthJobs []healthJob

	prefix := stackName + "_"
	for _, svc := range services.Items {
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
			taskImg := ""
			if t.Spec.ContainerSpec != nil {
				taskImg = strings.TrimSpace(t.Spec.ContainerSpec.Image)
			}
			info.Tasks = append(info.Tasks, TaskInfo{
				Name:         taskDisplayName(t, full),
				DesiredState: string(t.DesiredState),
				CurrentState: formatTaskCurrentState(t),
				Error:        strings.TrimSpace(t.Status.Err),
				Image:        taskImg,
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
				cs := t.Status.ContainerStatus
				if cs == nil || cs.ContainerID == "" {
					continue
				}
				healthJobs = append(healthJobs, healthJob{short: short, cid: cs.ContainerID})
			}
		}
		out.Services[short] = info
	}

	enrichTaskHealths(ctx, apiClient, out.Services, healthJobs)
	return out, nil
}

type healthJob struct {
	short string
	cid   string
}

const healthInspectLimit = 8

// enrichTaskHealths inspects container health in parallel (limit healthInspectLimit).
// Inspect failures are ignored (same as prior serial path).
func enrichTaskHealths(ctx context.Context, apiClient *client.Client, services map[string]ServiceInfo, jobs []healthJob) {
	if len(jobs) == 0 {
		return
	}
	results := make([]TaskHealth, len(jobs))
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(healthInspectLimit)
	for i, job := range jobs {
		g.Go(func() error {
			results[i] = containerHealth(gctx, apiClient, job.cid)
			return nil
		})
	}
	_ = g.Wait()
	for i, job := range jobs {
		h := results[i]
		if h == "" || h == TaskHealthNone {
			continue
		}
		info := services[job.short]
		info.TaskHealths = append(info.TaskHealths, h)
		services[job.short] = info
	}
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
		if after, ok := strings.CutPrefix(e, prefix); ok {
			return strings.TrimSpace(after)
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
	if slices.Contains(parts, "") {
		return ""
	}
	return tag
}

// HealthSummary is worst-wins light + "N/M services up" detail.
// No stack membership → HealthOff (not red) so TUI can show Start vs Repair:
// Docker green + Health off = nothing deployed; amber/red = unhealthy stack.
func (s StackSnapshot) HealthSummary() (HealthLight, string) {
	if !s.Present {
		return HealthOff, "no stack services"
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
	maps.Copy(out, svc.Spec.Labels)
	if cs := svc.Spec.TaskTemplate.ContainerSpec; cs != nil {
		maps.Copy(out, cs.Labels)
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
