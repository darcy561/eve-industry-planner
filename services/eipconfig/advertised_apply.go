package eipconfig

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"eve-industry-planner/shared/appconfig"
)

// AdvertisedVersionPlan is the Redis advertise plan for make advertise / release / dev-release (#23).
// Not part of make swarm-sync. Flipping SoT does not rebuild containers.
type AdvertisedVersionPlan struct {
	Want    string
	Live    string
	Changed bool
}

// PlanAdvertisedVersion compares want (from .env APP_VERSION) to the live Redis SoT.
func PlanAdvertisedVersion(want, live string) AdvertisedVersionPlan {
	want = strings.TrimSpace(want)
	live = strings.TrimSpace(live)
	if live == "(nil)" {
		live = ""
	}
	p := AdvertisedVersionPlan{Want: want, Live: live}
	if want == "" {
		return p
	}
	p.Changed = want != live
	return p
}

// ApplyAdvertisedVersion SETs Redis + PUBLISHes when want differs from the live SoT.
// want comes from .env APP_VERSION (make advertise / release). Uses docker exec into Redis.
func ApplyAdvertisedVersion(want string, dryRun bool) error {
	want = strings.TrimSpace(want)
	if want == "" {
		return fmt.Errorf("advertised version: empty (set APP_VERSION in .env)")
	}

	live, err := redisRawGET(appconfig.AdvertisedVersionKey())
	if err != nil {
		return fmt.Errorf("advertised version GET: %w", err)
	}
	plan := PlanAdvertisedVersion(want, live)
	if !plan.Changed {
		fmt.Printf("advertised version: unchanged %s=%s\n", appconfig.AdvertisedVersionKey(), plan.Want)
		return nil
	}
	from := plan.Live
	if from == "" {
		from = "(empty)"
	}
	fmt.Printf("advertised version: %s -> %s\n", from, plan.Want)
	if dryRun {
		fmt.Printf("dry-run: SET %s + PUBLISH %s\n",
			appconfig.AdvertisedVersionKey(), appconfig.AdvertisedVersionChannel())
		return nil
	}
	if err := redisSETPublish(plan.Want); err != nil {
		return err
	}
	fmt.Printf("advertised version: SET %s + PUBLISH ok\n", appconfig.AdvertisedVersionKey())
	return nil
}

func redisSETPublish(version string) error {
	key := appconfig.AdvertisedVersionKey()
	ch := appconfig.AdvertisedVersionChannel()
	if _, err := redisCLI("SET", key, version); err != nil {
		return err
	}
	if _, err := redisCLI("PUBLISH", ch, version); err != nil {
		return err
	}
	return nil
}

func redisRawGET(key string) (string, error) {
	out, err := redisCLI("--raw", "GET", key)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func redisCLI(args ...string) (string, error) {
	pass, err := redisPassword()
	if err != nil {
		return "", err
	}
	container, err := redisContainer()
	if err != nil {
		return "", err
	}
	cmdArgs := []string{"exec", container, "redis-cli", "-a", pass, "--no-auth-warning"}
	cmdArgs = append(cmdArgs, args...)
	cmd := exec.Command("docker", cmdArgs...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("docker %s: %w (%s)", strings.Join(cmdArgs, " "), err, strings.TrimSpace(stderr.String()))
	}
	return stdout.String(), nil
}

func redisPassword() (string, error) {
	if v := strings.TrimSpace(os.Getenv("REDIS_PASSWORD")); v != "" {
		return v, nil
	}
	envFile := strings.TrimSpace(os.Getenv("EIP_ENV_FILE"))
	candidates := []string{}
	if envFile != "" {
		candidates = append(candidates, envFile)
	} else {
		// go run ./cmd/eipconfig usually has cwd=services/; repo .env is one level up.
		candidates = append(candidates, ".env", filepath.Join("..", ".env"))
	}
	var lastErr error
	for _, path := range candidates {
		pass, err := readEnvFileValue(path, "REDIS_PASSWORD")
		if err != nil {
			lastErr = err
			continue
		}
		if pass != "" {
			return pass, nil
		}
	}
	if lastErr != nil {
		return "", lastErr
	}
	return "", fmt.Errorf("REDIS_PASSWORD missing (set env or eip.config-adjacent .env)")
}

func redisContainer() (string, error) {
	if v := strings.TrimSpace(os.Getenv("EIP_REDIS_CONTAINER")); v != "" {
		return v, nil
	}
	cmd := exec.Command("docker", "ps", "--format", "{{.Names}}")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("docker ps: %w", err)
	}
	var fallback string
	for _, name := range strings.Split(string(out), "\n") {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if strings.Contains(name, "redisDB") {
			return name, nil
		}
		lower := strings.ToLower(name)
		if strings.Contains(lower, "redis") && !strings.Contains(lower, "exporter") && fallback == "" {
			fallback = name
		}
	}
	if fallback != "" {
		return fallback, nil
	}
	return "", fmt.Errorf("could not find redis container (set EIP_REDIS_CONTAINER)")
}

func readEnvFileValue(path, key string) (string, error) {
	if !filepath.IsAbs(path) {
		if abs, err := filepath.Abs(path); err == nil {
			path = abs
		}
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	prefix := key + "="
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if !strings.HasPrefix(line, prefix) {
			continue
		}
		v := strings.TrimPrefix(line, prefix)
		v = strings.Trim(v, "\"'")
		return strings.TrimSpace(v), nil
	}
	return "", nil
}
