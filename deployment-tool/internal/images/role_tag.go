package images

import (
	"context"
	"fmt"
	"strings"

	"github.com/moby/moby/client"
)

// roleTag resolves the tag a role's stack entry should carry.
//
// The running Swarm service is preferred: keeping a role on the tag it is
// already serving is what stops a deploy rolling services whose image did not
// change. When the service is absent the newest local tag for its repo is used
// instead — without that fallback a role cannot be brought back once its service
// is gone, because the tag needed to deploy it could only be read from the
// deployment that no longer exists.
func roleTag(ctx context.Context, apiClient *client.Client, repo, serviceImage string) (string, error) {
	if tag := swarmLocalTag(repo, serviceImage); tag != "" {
		return tag, nil
	}
	return newestLocalTag(ctx, apiClient, repo)
}

// newestLocalTag returns the most recently created tag held locally for repo,
// ignoring the working tag every bake overwrites.
func newestLocalTag(ctx context.Context, apiClient *client.Client, repo string) (string, error) {
	if repo == "" {
		return "", fmt.Errorf("images: empty repo")
	}
	res, err := apiClient.ImageList(ctx, client.ImageListOptions{
		Filters: make(client.Filters).Add("reference", repo),
	})
	if err != nil {
		return "", fmt.Errorf("images: list %s: %w", repo, err)
	}

	var (
		newest  string
		created int64
	)
	prefix := repo + ":"
	for _, summary := range res.Items {
		for _, repoTag := range summary.RepoTags {
			if !strings.HasPrefix(repoTag, prefix) {
				continue
			}
			tag := strings.TrimPrefix(repoTag, prefix)
			if tag == "" || tag == bakeWorkingTag {
				continue
			}
			if newest == "" || summary.Created > created {
				newest, created = tag, summary.Created
			}
		}
	}
	return newest, nil
}
