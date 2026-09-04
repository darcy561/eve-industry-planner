package deploy

import (
	"context"
	"fmt"
	"path/filepath"

	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/config"
	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/kit"
)

// View is a read-only deploy inspection used by status reporting.
type View struct {
	Home      string
	StackName string
	Snapshot  docker.StackSnapshot
	Source    Source
	Fragments []FragmentState

	// ObsEnabled is addons.observability.enabled, so status can report the addon's
	// services as missing rather than hiding the group when nothing is deployed yet.
	ObsEnabled bool
}

// Inspect loads project home + stack snapshot and classifies source / fragments.
func Inspect(ctx context.Context, apiClient *client.Client) (View, error) {
	home, err := kit.Home()
	if err != nil {
		return View{}, fmt.Errorf("project home: %w", err)
	}
	name := docker.ResolveStackName()
	snap, err := docker.LoadStackSnapshot(ctx, apiClient, name)
	if err != nil {
		return View{}, err
	}
	return View{
		Home:       home,
		StackName:  snap.Name,
		Snapshot:   snap,
		Source:     ResolveSource(snap),
		Fragments:  FragmentStates(snap),
		ObsEnabled: ObservabilityEnabled(home),
	}, nil
}

// ObservabilityEnabled reads addons.observability.enabled for the project at home.
// An unreadable config reports the addon off rather than failing the caller: status
// and repair must still work on a broken eip.config.yaml.
func ObservabilityEnabled(home string) bool {
	cfg, err := config.LoadYAML(filepath.Join(home, kit.ConfigFile))
	if err != nil {
		return false
	}
	return cfg.Addons.Observability.Enabled
}
