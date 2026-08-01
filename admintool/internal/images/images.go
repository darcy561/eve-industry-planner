// Package images pulls live GHCR/public images or bakes local TAG_* for eip dev.
package images

import (
	"context"
	"fmt"

	"eve-industry-planner/admintool/internal/dockercli"
	"eve-industry-planner/admintool/internal/msg"
)

// PullLive pulls unique image refs from app + data stack YAML (and obs when wantObs).
func PullLive(ctx context.Context, home string, wantObs bool) error {
	refs, err := LiveImageRefs(home, wantObs)
	if err != nil {
		return err
	}
	images := UniqueImages(refs)
	msg.Step("Pulling %d images…", len(images))
	for _, ref := range images {
		msg.Step("  pull %s", ref)
		if err := dockercli.Run(ctx, "pull", ref); err != nil {
			return fmt.Errorf("pull %s: %w", ref, err)
		}
	}
	return nil
}
