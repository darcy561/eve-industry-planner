package deploy

import (
	"context"
	"fmt"

	"github.com/moby/moby/client"

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
		Home:      home,
		StackName: snap.Name,
		Snapshot:  snap,
		Source:    ResolveSource(snap),
		Fragments: FragmentStates(snap),
	}, nil
}
