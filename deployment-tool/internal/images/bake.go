package images

import (
	"bytes"
	"context"
	_ "embed"
	"fmt"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/dockercli"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/stack"
)

//go:embed docker-bake.hcl
var bakeHCL []byte

const bakeWorkingTag = "bake"

// Bake builds local app images (buildx bake → :bake), then promotes a per-role
// TAG_* only when that role's :bake digest differs from the image already
// desired by the live Swarm service. First bring-up (no local tag) promotes.
// Returns APP_VERSION + TAG_* for expand. Digest compare SoT is the live Swarm service image.
func Bake(ctx context.Context, home string, extraArgs ...string) (map[string]string, error) {
	noCache, roles, err := parseBakeArgs(extraArgs)
	if err != nil {
		return nil, err
	}

	envMap, err := kit.Map(filepath.Join(home, kit.EnvFile))
	if err != nil {
		return nil, err
	}
	appVersion := kit.Get(envMap, "APP_VERSION")
	if appVersion == "" {
		appVersion = "0.0.0"
	}

	devDoc, err := stack.Load(filepath.Join(home, kit.AppStackDevFile))
	if err != nil {
		return nil, err
	}
	devRoles := stack.ImageRepos(devDoc)
	if len(roles) == 0 {
		roles = slices.Sorted(maps.Keys(devRoles))
	} else {
		for _, r := range roles {
			if _, ok := devRoles[r]; !ok {
				return nil, fmt.Errorf("bake: %q is not a bakeable service in %s", r, kit.AppStackDevFile)
			}
		}
	}
	if len(roles) == 0 {
		return nil, fmt.Errorf("bake: no roles in %s", kit.AppStackDevFile)
	}

	msg.Step("Baking local images…")
	if msg.Enabled() {
		msg.Step("  buildx progress (may take several minutes)…")
	}
	if err := runBuildxBake(ctx, home, envMap, appVersion, noCache, roles); err != nil {
		return nil, err
	}

	apiClient, err := docker.NewAPIClient(client.WithTimeout(30 * time.Second))
	if err != nil {
		return nil, fmt.Errorf("engine API client: %w", err)
	}
	defer apiClient.Close()

	bakeDigests := map[string]string{}
	for _, role := range roles {
		repo := devRoles[role]
		ref := repo + ":" + bakeWorkingTag
		dig, err := imageDigest(ctx, apiClient, ref)
		if err != nil || dig == "" {
			return nil, fmt.Errorf("bake: no image digest for %s after bake", ref)
		}
		bakeDigests[role] = dig
	}

	snap, err := docker.LoadStackSnapshot(ctx, apiClient, docker.ResolveStackName())
	if err != nil {
		return nil, fmt.Errorf("bake: stack snapshot: %w", err)
	}

	tags := map[string]string{}
	for role, repo := range devRoles {
		if slices.Contains(roles, role) {
			continue
		}
		if tag := swarmLocalTag(repo, snap.Services[role].Image); tag != "" {
			tags[role] = tag
		}
	}

	var promote []string
	keep := 0
	for _, role := range roles {
		repo := devRoles[role]
		newDig := bakeDigests[role]
		oldTag := swarmLocalTag(repo, snap.Services[role].Image)
		if oldTag == "" {
			promote = append(promote, role)
			msg.Step("  promote %s (no active local tag)", role)
			continue
		}
		oldDig, err := imageDigest(ctx, apiClient, repo+":"+oldTag)
		if err != nil || oldDig == "" {
			promote = append(promote, role)
			msg.Step("  promote %s (active image missing)", role)
			continue
		}
		if newDig != oldDig {
			promote = append(promote, role)
			msg.Step("  promote %s (digest changed)", role)
			continue
		}
		tags[role] = oldTag
		keep++
		msg.Step("  keep %s tag=%s (digest unchanged)", role, oldTag)
	}

	if len(promote) == 0 {
		msg.Step("Images unchanged (%d roles).", keep)
	} else {
		newTag := appVersion + "-" + time.Now().UTC().Format("20060102150405")
		msg.Step("Updated images: %s → %s", strings.Join(promote, " "), newTag)
		for _, role := range promote {
			repo := devRoles[role]
			src := repo + ":" + bakeWorkingTag
			dst := repo + ":" + newTag
			if _, err := apiClient.ImageTag(ctx, client.ImageTagOptions{Source: src, Target: dst}); err != nil {
				return nil, fmt.Errorf("bake: tag %s: %w", dst, err)
			}
			tags[role] = newTag
		}
	}

	out := map[string]string{"APP_VERSION": appVersion}
	for role, tag := range tags {
		out["TAG_"+roleEnvKey(role)] = tag
	}
	for _, role := range roles {
		key := "TAG_" + roleEnvKey(role)
		if out[key] == "" {
			return nil, fmt.Errorf("bake: missing tag for %s", role)
		}
	}
	return out, nil
}

func parseBakeArgs(args []string) (noCache bool, roles []string, err error) {
	for _, a := range args {
		switch a {
		case "--no-cache":
			noCache = true
		case "--dry-run", "-n", "-h", "--help":
			return false, nil, fmt.Errorf("bake: unsupported arg %q", a)
		case "swarm":
			// all roles — leave roles empty
		default:
			if strings.HasPrefix(a, "-") {
				return false, nil, fmt.Errorf("bake: unknown flag %q", a)
			}
			roles = append(roles, a)
		}
	}
	return noCache, roles, nil
}

func runBuildxBake(ctx context.Context, home string, envMap map[string]string, appVersion string, noCache bool, roles []string) error {
	args := []string{"buildx", "bake", "-f", "-"}
	if noCache {
		args = append(args, "--no-cache")
	}
	// Quiet hides all BuildKit output. Under TUI (and EIP_VERBOSE) use plain so
	// the OUTPUT pane keeps moving — buildx writes progress on stderr.
	stream := dockercli.Verbose() || msg.Enabled()
	if stream {
		args = append(args, "--progress=plain")
	} else {
		args = append(args, "--progress=quiet")
	}
	if len(roles) == 0 {
		args = append(args, "swarm")
	} else {
		args = append(args, roles...)
	}

	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Dir = home
	cmd.Env = bakeCmdEnv(envMap, appVersion)
	cmd.Stdin = bytes.NewReader(bakeHCL)
	var lineW *msg.LineWriter
	if msg.Enabled() {
		// Relay stdout+stderr as pane.text (not raw child stderr "errors").
		lineW = msg.NewLineWriter()
		cmd.Stdout = lineW
		cmd.Stderr = lineW
	} else {
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
	}
	err := cmd.Run()
	if lineW != nil {
		lineW.Flush()
	}
	if err != nil {
		return fmt.Errorf("buildx bake: %w", err)
	}
	return nil
}

func bakeCmdEnv(envMap map[string]string, appVersion string) []string {
	overlay := map[string]string{
		"APP_VERSION":            appVersion,
		"FRONTEND_APP_VERSION":   appVersion,
		"BAKE_WORKING_TAG":       bakeWorkingTag,
		"ENVIRONMENT":            "development",
		"APP_FEATURE_FLAGS_JSON": `{"enable_upcoming_changes_page":false}`,
	}
	if v := kit.Get(envMap, "ENVIRONMENT"); v != "" {
		overlay["ENVIRONMENT"] = v
	}
	for _, k := range []string{
		"SENTRY_DSN", "SENTRY_TRACES_SAMPLE_RATE", "SENTRY_ORG", "SENTRY_PROJECT_ID",
		"SENTRY_AUTH_TOKEN", "SENTRY_ERROR_SAMPLE_RATE", "FEEDBACK_DISCORD_WEBHOOK_URL",
		"APP_FEATURE_FLAGS_JSON",
	} {
		if v := kit.Get(envMap, k); v != "" {
			overlay[k] = v
		}
	}
	return kit.MergeEnviron(overlay)
}

func roleEnvKey(role string) string {
	return strings.ReplaceAll(role, "-", "_")
}

// swarmLocalTag returns the tag if serviceImage is repo:tag for the local bake repo.
func swarmLocalTag(repo, serviceImage string) string {
	serviceImage = strings.TrimSpace(serviceImage)
	if serviceImage == "" || repo == "" {
		return ""
	}
	serviceImage, _, _ = strings.Cut(serviceImage, "@")
	prefix := repo + ":"
	if !strings.HasPrefix(serviceImage, prefix) {
		return ""
	}
	tag := strings.TrimPrefix(serviceImage, prefix)
	if tag == "" || tag == bakeWorkingTag {
		return ""
	}
	return tag
}

// imageDigest: RepoDigests[0] else Id (Moby ImageInspect).
func imageDigest(ctx context.Context, apiClient *client.Client, ref string) (string, error) {
	insp, err := apiClient.ImageInspect(ctx, ref)
	if err != nil {
		return "", err
	}
	if len(insp.RepoDigests) > 0 {
		d := strings.TrimSpace(insp.RepoDigests[0])
		if d != "" {
			if _, after, ok := strings.Cut(d, "@"); ok {
				return after, nil
			}
			return d, nil
		}
	}
	id := strings.TrimSpace(insp.ID)
	if id == "" {
		return "", fmt.Errorf("no digest for %s", ref)
	}
	return id, nil
}
