// Secrets sync curated .env keys to versioned Swarm secret objects (Moby Secret*
// APIs — not `docker secret` CLI). Per-service attach lists come from
// docker-stack.yml secrets: (stack SoT). Deploy injects SecretsOverlay into the
// expanded app stack via stack.InjectSecrets.
package swarm

import (
	"context"
	"fmt"
	"maps"
	"path/filepath"
	"slices"
	"time"

	"github.com/containerd/errdefs"
	swarmtypes "github.com/moby/moby/api/types/swarm"
	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/stack"
)

// RequiredKeys must be non-empty in .env.
var RequiredKeys = []string{
	"MONGO_USERNAME",
	"MONGO_PASSWORD",
	"REDIS_PASSWORD",
	"S3_ACCESS_KEY",
	"S3_SECRET_KEY",
	"EVE_CLIENT_SECRET",
	"REFRESH_TOKEN_AES_KEY",
	"AUTHZ_HMAC_KEY",
}

// OptionalKeys are created/attached only when set in .env.
var OptionalKeys = []string{
	"MONGO_USERNAME_API",
	"MONGO_PASSWORD_API",
	"REDIS_USERNAME_API",
	"REDIS_PASSWORD_API",
	"REFRESH_TOKEN_AES_LEGACY_KEYS",
	"FEEDBACK_DISCORD_WEBHOOK_URL",
}

var optionalSet = func() map[string]struct{} {
	m := make(map[string]struct{}, len(OptionalKeys))
	for _, k := range OptionalKeys {
		m[k] = struct{}{}
	}
	return m
}()

// Attach is one service → logical secret key from stack YAML.
type Attach = stack.SecretAttach

// SecretsOverlay maps logical keys to hashed Swarm object names for expand inject.
type SecretsOverlay struct {
	KeyToObj map[string]string // logical key → hashed object name
	Attach   []Attach
}

// DiscoverAttach reads per-service secrets: lists from a stack fragment.
func DiscoverAttach(stackPath string) ([]Attach, error) {
	doc, err := stack.Load(stackPath)
	if err != nil {
		return nil, err
	}
	return stack.SecretAttaches(doc), nil
}

// ValidateEnv checks required .env keys are non-empty without touching Swarm.
func ValidateEnv(home string) error {
	m, err := kit.Map(filepath.Join(home, kit.EnvFile))
	if err != nil {
		return err
	}
	for _, key := range RequiredKeys {
		if kit.Get(m, key) == "" {
			return fmt.Errorf("required secret %s is empty in %s", key, kit.EnvFile)
		}
	}
	return nil
}

// Sync creates secret objects and returns an SecretsOverlay for expand inject.
func SyncSecrets(ctx context.Context, home string) (SecretsOverlay, error) {
	envPath := filepath.Join(home, kit.EnvFile)
	m, err := kit.Map(envPath)
	if err != nil {
		return SecretsOverlay{}, err
	}
	stackPath := filepath.Join(home, kit.AppStackFile)
	attach, err := DiscoverAttach(stackPath)
	if err != nil {
		return SecretsOverlay{}, err
	}

	payloads, err := collectSecretPayloads(m, attach)
	if err != nil {
		return SecretsOverlay{}, err
	}
	apiClient, err := docker.NewAPIClient(client.WithTimeout(2 * time.Minute))
	if err != nil {
		return SecretsOverlay{}, fmt.Errorf("secrets: engine API client: %w", err)
	}
	defer apiClient.Close()

	keyToObj := map[string]string{}
	for _, key := range slices.Sorted(maps.Keys(payloads)) {
		obj, err := ensureSecret(ctx, apiClient, key, payloads[key])
		if err != nil {
			return SecretsOverlay{}, err
		}
		keyToObj[key] = obj
	}

	return SecretsOverlay{KeyToObj: keyToObj, Attach: attach}, nil
}

// collectSecretPayloads validates .env against Required/Optional/attach and
// returns logical key → value for secrets that should be created (no Swarm).
func collectSecretPayloads(env map[string]string, attach []Attach) (map[string]string, error) {
	out := map[string]string{}
	for _, key := range RequiredKeys {
		val := kit.Get(env, key)
		if val == "" {
			return nil, fmt.Errorf("required secret %s is empty in %s", key, kit.EnvFile)
		}
		out[key] = val
	}
	for _, key := range OptionalKeys {
		val := kit.Get(env, key)
		if val == "" {
			continue
		}
		out[key] = val
	}
	known := map[string]struct{}{}
	for _, k := range RequiredKeys {
		known[k] = struct{}{}
	}
	for _, k := range OptionalKeys {
		known[k] = struct{}{}
	}
	for _, a := range attach {
		if _, ok := known[a.Key]; ok {
			continue
		}
		val := kit.Get(env, a.Key)
		if val == "" {
			return nil, fmt.Errorf("stack secret %s on %s is not in RequiredKeys/OptionalKeys", a.Key, a.Service)
		}
		out[a.Key] = val
	}
	return out, nil
}

// ByService returns service → logical keys (optional unset keys omitted).
func (o SecretsOverlay) ByService() (map[string][]string, error) {
	bySvc := map[string][]string{}
	for _, a := range o.Attach {
		if _, has := o.KeyToObj[a.Key]; !has {
			if _, opt := optionalSet[a.Key]; opt {
				continue
			}
			return nil, fmt.Errorf("secret %s required for service %s but not created", a.Key, a.Service)
		}
		bySvc[a.Service] = append(bySvc[a.Service], a.Key)
	}
	for svc, list := range bySvc {
		slices.Sort(list)
		bySvc[svc] = slices.Compact(list)
	}
	return bySvc, nil
}

// PruneStale removes older eip_<KEY>_* secret objects superseded by KeyToObj hashes.
func PruneStale(ctx context.Context, o SecretsOverlay) {
	if len(o.KeyToObj) == 0 {
		return
	}
	apiClient, err := docker.NewAPIClient()
	if err != nil {
		return
	}
	defer apiClient.Close()

	secrets, err := apiClient.SecretList(ctx, client.SecretListOptions{})
	if err != nil {
		return
	}
	names := make([]string, 0, len(secrets.Items))
	for _, secret := range secrets.Items {
		names = append(names, secret.Spec.Name)
	}
	for key, keep := range o.KeyToObj {
		for _, name := range supersededObjectNames(names, key, keep) {
			if _, err := apiClient.SecretRemove(ctx, name, client.SecretRemoveOptions{}); err == nil {
				msg.Line("pruned superseded docker secret " + name)
			}
		}
	}
}

func ensureSecret(ctx context.Context, apiClient *client.Client, key, value string) (string, error) {
	raw := []byte(value)
	obj := Name(key, raw)
	if _, err := apiClient.SecretInspect(ctx, obj, client.SecretInspectOptions{}); err == nil {
		return obj, nil
	} else if !errdefs.IsNotFound(err) {
		return "", fmt.Errorf("inspect secret %s: %w", obj, err)
	}
	if _, err := apiClient.SecretCreate(ctx, client.SecretCreateOptions{
		Spec: swarmtypes.SecretSpec{
			Annotations: swarmtypes.Annotations{Name: obj},
			Data:        raw,
		},
	}); err != nil {
		if errdefs.IsConflict(err) || errdefs.IsAlreadyExists(err) {
			if _, inspErr := apiClient.SecretInspect(ctx, obj, client.SecretInspectOptions{}); inspErr == nil {
				return obj, nil
			}
		}
		return "", fmt.Errorf("create secret %s: %w", obj, err)
	}
	return obj, nil
}
