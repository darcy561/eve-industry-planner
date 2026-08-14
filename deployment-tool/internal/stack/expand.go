package stack

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/compose-spec/compose-go/v2/loader"
	"github.com/compose-spec/compose-go/v2/types"

	"eve-industry-planner/deployment-tool/internal/kit"
)

// LabelDeploySource matches deploy.LabelDeploySource (duplicated to avoid an import cycle).
const LabelDeploySource = "eip.deploy.source"

var publishedQuoted = regexp.MustCompile(`(?m)^([[:space:]]*published: )"([0-9]+)"$`)

// compose-go FileMode marshals as mode: "0755"; docker stack deploy wants a number.
var modeQuoted = regexp.MustCompile(`(?m)^([[:space:]]*mode: )"([0-9]+)"$`)

// Opts configures stack expand.
type Opts struct {
	Home       string
	StackFiles []string          // relative or absolute paths under Home
	Env        map[string]string // bake TAG_*, … — process env for compose
	Source     string            // "live" | "dev"
	SyncEnv    map[string]string // from config.Config.SyncEnvMap()
}

// Expand interpolates/merges stack fragments, strips configs/secrets for Inject*,
// stamps eip.deploy.source, and writes a temp YAML for docker stack deploy.
// Caller must os.Remove the returned path.
func Expand(ctx context.Context, opts Opts) (string, error) {
	if opts.Home == "" {
		return "", fmt.Errorf("stack: empty home")
	}
	if len(opts.StackFiles) == 0 {
		return "", fmt.Errorf("stack: no stack files")
	}
	switch opts.Source {
	case "live", "dev":
	default:
		return "", fmt.Errorf("stack: source must be live or dev")
	}

	sources, err := prepareComposeSources(opts.Home, opts.StackFiles)
	if err != nil {
		return "", err
	}

	env, err := expandEnvironment(opts.Home, opts.SyncEnv, opts.Env)
	if err != nil {
		return "", err
	}
	if err := applyWikiExpandEnv(env, opts.Source, sources); err != nil {
		return "", err
	}

	project, err := loadComposeProject(ctx, opts.Home, sources, env)
	if err != nil {
		return "", fmt.Errorf("compose load: %w", err)
	}

	prepareProjectForStack(project, opts.Source)

	raw, err := project.MarshalYAML()
	if err != nil {
		return "", fmt.Errorf("compose marshal: %w", err)
	}

	text := publishedQuoted.ReplaceAllString(string(raw), `${1}$2`)
	text = normalizeModeNumbers(text)
	// compose-go already interpolated; docker stack deploy interpolates again.
	// Re-escape literal $ (e.g. regex anchors in Traefik labels) as $$.
	text = escapeDollarsForStackDeploy(text)

	out, err := os.CreateTemp("", "eip-stack-*.yml")
	if err != nil {
		return "", err
	}
	path := out.Name()
	if _, err := out.WriteString(text); err != nil {
		_ = out.Close()
		_ = os.Remove(path)
		return "", err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return path, nil
}

// expandEnvironment: .env base, then OS + SyncEnv + Env (later win).
func expandEnvironment(home string, syncEnv, env map[string]string) (types.Mapping, error) {
	out := types.Mapping{}
	envPath := filepath.Join(home, kit.EnvFile)
	if _, err := os.Stat(envPath); err == nil {
		m, err := kit.Map(envPath)
		if err != nil {
			return nil, err
		}
		maps.Copy(out, m)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	for _, kv := range kit.MergeEnviron(syncEnv, env) {
		k, v, ok := strings.Cut(kv, "=")
		if !ok || k == "" {
			continue
		}
		out[k] = v
	}
	return out, nil
}

func loadComposeProject(ctx context.Context, home string, sources []composeSource, env types.Mapping) (*types.Project, error) {
	files := make([]types.ConfigFile, 0, len(sources))
	for _, s := range sources {
		if s.Path == "" || len(s.YAML) == 0 {
			return nil, fmt.Errorf("stack: empty compose source")
		}
		files = append(files, types.ConfigFile{Filename: s.Path, Content: s.YAML})
	}

	return loader.LoadWithContext(ctx, types.ConfigDetails{
		WorkingDir:  home,
		ConfigFiles: files,
		Environment: env,
	}, func(opts *loader.Options) {
		opts.SetProjectName("eip", true)
	})
}

func prepareProjectForStack(p *types.Project, source string) {
	p.Name = ""
	p.Configs = nil
	p.Secrets = nil
	for name, svc := range p.Services {
		svc.Secrets = nil
		if svc.Deploy == nil {
			svc.Deploy = &types.DeployConfig{}
		}
		if svc.Deploy.Labels == nil {
			svc.Deploy.Labels = types.Labels{}
		}
		svc.Deploy.Labels[LabelDeploySource] = source
		p.Services[name] = svc
	}
}

func normalizeModeNumbers(text string) string {
	return modeQuoted.ReplaceAllStringFunc(text, func(m string) string {
		sub := modeQuoted.FindStringSubmatch(m)
		if len(sub) != 3 {
			return m
		}
		n, err := strconv.ParseUint(sub[2], 0, 32)
		if err != nil {
			return m
		}
		return sub[1] + strconv.FormatUint(n, 10)
	})
}

func escapeDollarsForStackDeploy(text string) string {
	return strings.ReplaceAll(text, "$", "$$")
}
