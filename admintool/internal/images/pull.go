// Package images pulls live GHCR/public images (Moby ImagePull) or bakes local
// TAG_* for eip dev (buildx bake CLI + Moby ImageInspect/ImageTag).
package images

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/moby/moby/api/types/jsonstream"
	"github.com/moby/moby/client"
	"golang.org/x/sync/errgroup"
	"golang.org/x/sync/semaphore"

	"eve-industry-planner/admintool/internal/docker"
	"eve-industry-planner/admintool/internal/msg"
)

const defaultPullParallel = 4

// PullLive pulls unique live image refs (parallel; EIP_PULL_PARALLEL, default 4).
func PullLive(ctx context.Context, home string, wantObs bool) error {
	refs, err := LiveImageRefs(home, wantObs)
	if err != nil {
		return err
	}
	images := UniqueImages(refs)
	if len(images) == 0 {
		msg.Step("No images to pull")
		return nil
	}
	return pullImages(ctx, images, pullParallel())
}

func pullParallel() int {
	v := os.Getenv("EIP_PULL_PARALLEL")
	if v == "" {
		return defaultPullParallel
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return defaultPullParallel
	}
	if n > 16 {
		return 16
	}
	return n
}

func pullImages(ctx context.Context, images []string, parallel int) error {
	if parallel < 1 {
		parallel = 1
	}
	apiClient, err := docker.NewAPIClient()
	if err != nil {
		return fmt.Errorf("pull: engine API client: %w", err)
	}
	defer apiClient.Close()

	board := newPullBoard(images, parallel)
	board.emit(true)

	sem := semaphore.NewWeighted(int64(parallel))
	g, gctx := errgroup.WithContext(ctx)
	var mu sync.Mutex
	var upToDate, pulled int

	for _, ref := range images {
		g.Go(func() error {
			if err := sem.Acquire(gctx, 1); err != nil {
				return err
			}
			defer sem.Release(1)

			board.setStatus(ref, "pulling")
			wasUpToDate, size, err := pullOne(gctx, apiClient, ref, board)
			if err != nil {
				board.setError(ref, err)
				return fmt.Errorf("pull %s: %w", ref, err)
			}
			board.setDone(ref, wasUpToDate, size)
			mu.Lock()
			if wasUpToDate {
				upToDate++
			} else {
				pulled++
			}
			mu.Unlock()
			return nil
		})
	}

	err = g.Wait()
	board.finish()
	if err != nil {
		return err
	}
	msg.Step("Pull complete: %d updated, %d up to date", pulled, upToDate)
	return nil
}

func pullOne(ctx context.Context, apiClient *client.Client, ref string, board *pullBoard) (upToDate bool, size int64, err error) {
	opts := client.ImagePullOptions{RegistryAuth: registryAuthBase64(ref)}
	rc, err := apiClient.ImagePull(ctx, ref, opts)
	if err != nil {
		return false, 0, err
	}
	defer rc.Close()

	upToDate, err = consumePullStream(rc, ref, board)
	if err != nil {
		return false, 0, err
	}
	size, _ = localImageSize(ctx, apiClient, ref)
	return upToDate, size, nil
}

func consumePullStream(r io.Reader, ref string, board *pullBoard) (upToDate bool, err error) {
	dec := json.NewDecoder(r)
	for {
		var jm jsonstream.Message
		if err := dec.Decode(&jm); err != nil {
			if err == io.EOF {
				return upToDate, nil
			}
			return false, err
		}
		if jm.Error != nil {
			return false, fmt.Errorf("%s", jm.Error.Message)
		}
		if strings.Contains(strings.ToLower(jm.Status), "up to date") {
			upToDate = true
		}
		if board != nil {
			board.onJSON(ref, jm)
		}
	}
}

func localImageSize(ctx context.Context, apiClient *client.Client, ref string) (int64, error) {
	insp, err := apiClient.ImageInspect(ctx, ref)
	if err != nil {
		return 0, err
	}
	return insp.Size, nil
}
