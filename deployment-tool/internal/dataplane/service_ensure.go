package dataplane

import (
	"context"
	"slices"

	"eve-industry-planner/deployment-tool/internal/dataplane/mongo"
	"eve-industry-planner/deployment-tool/internal/dataplane/s3"
	"golang.org/x/sync/errgroup"
)

// ServiceEnsure binds a Swarm service short name to its dataplane ensure step.
// SoT for Ready (all) and repair (subset by short name). Register new ensures here only.
type ServiceEnsure struct {
	Short       string // catalog / stack short name, e.g. "mongo"
	Label       string // operator-facing progress label
	Run         func(context.Context, string) error
	TaskRunning func(context.Context, string) (bool, error)
}

// ServiceEnsures is the registry of per-service dataplane ensure steps.
func ServiceEnsures() []ServiceEnsure {
	return []ServiceEnsure{
		{
			Short:       "mongo",
			Label:       "mongo",
			Run:         ensureMongo,
			TaskRunning: mongo.TaskRunning,
		},
		{
			Short:       "seaweedfs",
			Label:       "S3",
			Run:         ensureS3,
			TaskRunning: s3.TaskRunning,
		},
	}
}

// HasServiceEnsure reports whether short has a registered ensure step.
func HasServiceEnsure(short string) bool {
	return slices.ContainsFunc(ServiceEnsures(), func(e ServiceEnsure) bool {
		return e.Short == short
	})
}

// RunAllEnsures runs every registered ensure concurrently (docs already checked).
func RunAllEnsures(ctx context.Context, stackName string) error {
	g, gctx := errgroup.WithContext(ctx)
	for _, e := range ServiceEnsures() {
		g.Go(func() error {
			return e.Run(gctx, stackName)
		})
	}
	return g.Wait()
}

// RunEnsuresFor runs registered ensures for the given short names in parallel.
// onSkip is called when a short is selected but its Swarm task is not running.
// Checks operator docs once when any registered short is selected.
func RunEnsuresFor(ctx context.Context, stackName string, shorts []string, onSkip func(ServiceEnsure)) error {
	if len(shorts) == 0 {
		return nil
	}
	want := make(map[string]bool, len(shorts))
	for _, s := range shorts {
		want[s] = true
	}

	var selected []ServiceEnsure
	for _, e := range ServiceEnsures() {
		if want[e.Short] {
			selected = append(selected, e)
		}
	}
	if len(selected) == 0 {
		return nil
	}
	if err := checkOperatorDocs(); err != nil {
		return err
	}

	g, gctx := errgroup.WithContext(ctx)
	for _, e := range selected {
		g.Go(func() error {
			up, err := e.TaskRunning(gctx, stackName)
			if err != nil {
				return err
			}
			if !up {
				if onSkip != nil {
					onSkip(e)
				}
				return nil
			}
			return e.Run(gctx, stackName)
		})
	}
	return g.Wait()
}
