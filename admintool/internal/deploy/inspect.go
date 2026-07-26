package deploy

import (
	"context"
	"fmt"

	"github.com/docker/docker/client"

	"eve-industry-planner/admintool/internal/docker"
	"eve-industry-planner/admintool/internal/kit"
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
func Inspect(ctx context.Context, cli client.APIClient) (View, error) {
	home, err := kit.Home()
	if err != nil {
		return View{}, fmt.Errorf("project home: %w", err)
	}
	name := docker.ResolveStackName()
	snap, err := docker.LoadStackSnapshot(ctx, cli, name)
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
