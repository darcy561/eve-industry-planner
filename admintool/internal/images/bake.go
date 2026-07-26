package images

import (
	"bytes"
	"context"
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/docker/docker/client"

	"eve-industry-planner/admintool/internal/docker"
	"eve-industry-planner/admintool/internal/dockercli"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/stack"
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
		roles = make([]string, 0, len(devRoles))
		for r := range devRoles {
			roles = append(roles, r)
		}
		sort.Strings(roles)
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
	if err := runBuildxBake(ctx, home, envMap, appVersion, noCache, roles); err != nil {
		return nil, err
	}

	cli, err := docker.NewClient(client.WithTimeout(30 * time.Second))
	if err != nil {
		return nil, fmt.Errorf("docker client: %w", err)
	}
	defer cli.Close()

	bakeDigests := map[string]string{}
	for _, role := range roles {
		repo := devRoles[role]
		ref := repo + ":" + bakeWorkingTag
		dig, err := imageDigest(ctx, ref)
		if err != nil || dig == "" {
			return nil, fmt.Errorf("bake: no image digest for %s after bake", ref)
		}
		bakeDigests[role] = dig
	}

	snap, err := docker.LoadStackSnapshot(ctx, cli, docker.ResolveStackName())
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
		oldDig, err := imageDigest(ctx, repo+":"+oldTag)
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
			if err := dockercli.Run(ctx, "tag", src, dst); err != nil {
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
	if dockercli.Verbose() {
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
	cmd.Stderr = os.Stderr
	var stdoutW *msg.LineWriter
	if msg.Enabled() {
		stdoutW = msg.NewLineWriter()
		cmd.Stdout = stdoutW
	} else {
		cmd.Stdout = os.Stdout
	}
	err := cmd.Run()
	if stdoutW != nil {
		stdoutW.Flush()
	}
	if err != nil {
		return fmt.Errorf("buildx bake: %w", err)
	}
	return nil
}

func bakeCmdEnv(envMap map[string]string, appVersion string) []string {
	overlay := map[string]string{
		"APP_VERSION":          appVersion,
		"FRONTEND_APP_VERSION": appVersion,
		"BAKE_WORKING_TAG":     bakeWorkingTag,
		"ENVIRONMENT":          "development",
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

// imageDigest matches scripts/lib/images.sh: RepoDigests[0] else Id.
func imageDigest(ctx context.Context, ref string) (string, error) {
	out, err := dockercli.RunOut(ctx, "image", "inspect", ref,
		"--format", "{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}")
	if err == nil {
		d := strings.TrimSpace(out)
		if d != "" {
			if i := strings.Index(d, "@"); i >= 0 {
				return d[i+1:], nil
			}
			return d, nil
		}
	}
	out, err = dockercli.RunOut(ctx, "image", "inspect", ref, "--format", "{{.Id}}")
	if err != nil {
		return "", err
	}
	id := strings.TrimSpace(out)
	if id == "" || id == "missing" {
		return "", fmt.Errorf("no digest for %s", ref)
	}
	return id, nil
}
