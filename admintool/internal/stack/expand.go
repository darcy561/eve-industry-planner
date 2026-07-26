// Expand interpolates stack YAML via docker compose config,
// strips inline configs/secrets for Inject* re-add, and stamps eip.deploy.source.
package stack

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"

	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/yamlutil"
)

// LabelDeploySource matches deploy.LabelDeploySource (duplicated to avoid an import cycle).
const LabelDeploySource = "eip.deploy.source"

var publishedQuoted = regexp.MustCompile(`(?m)^([[:space:]]*published: )"([0-9]+)"$`)

// compose config emits mode: "0755"; docker stack deploy requires a number.
var modeQuoted = regexp.MustCompile(`(?m)^([[:space:]]*mode: )"([0-9]+)"$`)

// Opts configures stack expand.
type Opts struct {
	Home       string
	StackFiles []string          // relative or absolute paths under Home
	Env        map[string]string // sync-env, bake TAG_*, … — process env for compose
	Source     string            // "live" | "dev"
	SyncEnv    map[string]string // from eipconfig.Config.SyncEnvMap()
}

// Expand runs docker compose config, strips project name, unquotes published ports,
// strips compose-emitted configs/secrets (callers inject hashed externals via
// InjectExternalConfigs / InjectSecrets), and stamps eip.deploy.source labels.
// Returns a temp expanded stack YAML path for docker stack deploy -c; caller must os.Remove.
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

	composeFiles, cleanup, err := prepareComposeFiles(opts.Home, opts.StackFiles)
	if err != nil {
		return "", err
	}
	defer cleanup()

	args := []string{"compose", "--env-file", filepath.Join(opts.Home, kit.EnvFile)}
	for _, p := range composeFiles {
		args = append(args, "-f", p)
	}
	args = append(args, "config")

	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Dir = opts.Home
	cmd.Env = kit.MergeEnviron(opts.SyncEnv, opts.Env)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("docker compose config: %w\n%s", err, stderr.String())
	}

	raw := stdout.Bytes()
	lines := strings.Split(string(raw), "\n")
	if len(lines) > 0 && strings.HasPrefix(strings.TrimSpace(lines[0]), "name:") {
		lines = lines[1:]
	}
	text := strings.Join(lines, "\n")
	text = publishedQuoted.ReplaceAllString(text, `${1}$2`)

	text, err = stripConfigsBlock(text)
	if err != nil {
		return "", err
	}
	// Drop inline secrets; InjectSecrets re-adds hashed external mounts.
	text, err = stripSecrets(text)
	if err != nil {
		return "", err
	}
	text, err = injectSourceLabels(text, opts.Source)
	if err != nil {
		return "", err
	}
	// yaml.Marshal keeps compose's quoted mode strings; stack deploy wants ints.
	text = normalizeModeNumbers(text)

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

// normalizeModeNumbers turns mode: "0755" into mode: 493 (decimal int).
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

func stripConfigsBlock(text string) (string, error) {
	return stripDocKey(text, "configs")
}

func stripSecrets(text string) (string, error) {
	text, err := stripDocKey(text, "secrets")
	if err != nil {
		return "", err
	}
	return stripServiceKey(text, "secrets")
}

func stripDocKey(text, key string) (string, error) {
	var root yaml.Node
	if err := yaml.Unmarshal([]byte(text), &root); err != nil {
		return "", fmt.Errorf("parse expanded yaml: %w", err)
	}
	if root.Kind != yaml.DocumentNode || len(root.Content) == 0 {
		return text, nil
	}
	doc := root.Content[0]
	if doc.Kind != yaml.MappingNode {
		return text, nil
	}
	for i := 0; i+1 < len(doc.Content); i += 2 {
		if doc.Content[i].Value == key {
			doc.Content = append(doc.Content[:i], doc.Content[i+2:]...)
			break
		}
	}
	out, err := yaml.Marshal(&root)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func stripServiceKey(text, key string) (string, error) {
	var root yaml.Node
	if err := yaml.Unmarshal([]byte(text), &root); err != nil {
		return "", err
	}
	if root.Kind != yaml.DocumentNode || len(root.Content) == 0 {
		return text, nil
	}
	doc := root.Content[0]
	services := mappingValue(doc, "services")
	if services == nil || services.Kind != yaml.MappingNode {
		return text, nil
	}
	for i := 0; i+1 < len(services.Content); i += 2 {
		svc := services.Content[i+1]
		if svc.Kind != yaml.MappingNode {
			continue
		}
		for j := 0; j+1 < len(svc.Content); j += 2 {
			if svc.Content[j].Value == key {
				svc.Content = append(svc.Content[:j], svc.Content[j+2:]...)
				break
			}
		}
	}
	out, err := yaml.Marshal(&root)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func injectSourceLabels(text string, src string) (string, error) {
	label := src
	var root yaml.Node
	if err := yaml.Unmarshal([]byte(text), &root); err != nil {
		return "", err
	}
	if root.Kind != yaml.DocumentNode || len(root.Content) == 0 {
		return text, nil
	}
	doc := root.Content[0]
	services := mappingValue(doc, "services")
	if services == nil || services.Kind != yaml.MappingNode {
		return text, nil
	}
	for i := 0; i+1 < len(services.Content); i += 2 {
		svc := services.Content[i+1]
		if svc.Kind != yaml.MappingNode {
			continue
		}
		deployNode := mappingValue(svc, "deploy")
		if deployNode == nil {
			deployNode = &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
			svc.Content = append(svc.Content,
				&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "deploy"},
				deployNode,
			)
		}
		labels := mappingValue(deployNode, "labels")
		if labels == nil || labels.Kind != yaml.MappingNode {
			labels = &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
			// Preserve existing list-form labels as key=value pairs when present.
			if old := mappingValue(deployNode, "labels"); old != nil && old.Kind == yaml.SequenceNode {
				for _, item := range old.Content {
					n := yamlutil.ResolvePtr(item)
					kv := strings.SplitN(n.Value, "=", 2)
					if len(kv) == 2 {
						setMappingString(labels, kv[0], kv[1])
					}
				}
			}
			setMappingChild(deployNode, "labels", labels)
		}
		setMappingString(labels, LabelDeploySource, label)
	}
	out, err := yaml.Marshal(&root)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func mappingValue(m *yaml.Node, key string) *yaml.Node {
	if m == nil || m.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			return m.Content[i+1]
		}
	}
	return nil
}

func setMappingString(m *yaml.Node, key, val string) {
	for i := 0; i+1 < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			m.Content[i+1].Kind = yaml.ScalarNode
			m.Content[i+1].Tag = "!!str"
			m.Content[i+1].Value = val
			return
		}
	}
	m.Content = append(m.Content,
		&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: key},
		&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: val},
	)
}

func setMappingChild(m *yaml.Node, key string, child *yaml.Node) {
	for i := 0; i+1 < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			m.Content[i+1] = child
			return
		}
	}
	m.Content = append(m.Content,
		&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: key},
		child,
	)
}
