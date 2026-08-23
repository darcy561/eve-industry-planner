package deploy

import (
	"context"
	"os"
	"path/filepath"

	"eve-industry-planner/deployment-tool/internal/config"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/stack"
	"eve-industry-planner/deployment-tool/internal/swarm"
)

// expandedStack is expand+inject output for docker stack deploy -c.
// Caller must os.Remove Data/App/Obs paths.
type expandedStack struct {
	Data    string
	App     string
	Obs     string // empty when observability addon off
	Secrets swarm.SecretsOverlay
}

// materializeExpanded syncs secrets/configs objects (Moby Secret*/Config*), expands
// fragments, and injects hashed externals into those expand paths.
func materializeExpanded(ctx context.Context, home string, src Source, cfg config.Config, expandEnv map[string]string) (expandedStack, error) {
	wantObs := cfg.Addons.Observability.Enabled
	if err := requireObsStack(home, wantObs); err != nil {
		return expandedStack{}, err
	}

	msg.Step("Syncing Swarm secrets…")
	secretsOv, err := swarm.SyncSecrets(ctx, home)
	if err != nil {
		return expandedStack{}, err
	}

	configStacks := []string{kit.DataStackFile, kit.AppStackFile}
	if wantObs {
		configStacks = append(configStacks, kit.ObsStackFile)
	}
	msg.Step("Syncing Swarm configs…")
	configsMap, err := swarm.SyncConfigs(ctx, home, configStacks...)
	if err != nil {
		return expandedStack{}, err
	}

	dataFiles := []string{kit.DataStackFile}
	if src == SourceDev {
		if _, err := os.Stat(filepath.Join(home, kit.DataStackDevFile)); err == nil {
			dataFiles = append(dataFiles, kit.DataStackDevFile)
		}
	}
	tmpData, err := expandFragment(ctx, "data", home, dataFiles, expandEnv, src, cfg.SyncEnvMap())
	if err != nil {
		return expandedStack{}, err
	}
	if err := stack.InjectExternalConfigs(tmpData, configsMap); err != nil {
		_ = os.Remove(tmpData)
		return expandedStack{}, err
	}

	appFiles := []string{kit.AppStackFile}
	if src == SourceDev {
		appFiles = append(appFiles, kit.AppStackDevFile)
	}
	tmpApp, err := expandFragment(ctx, "app", home, appFiles, expandEnv, src, cfg.SyncEnvMap())
	if err != nil {
		_ = os.Remove(tmpData)
		return expandedStack{}, err
	}
	bySvc, err := secretsOv.ByService()
	if err != nil {
		_ = os.Remove(tmpData)
		_ = os.Remove(tmpApp)
		return expandedStack{}, err
	}
	if err := stack.InjectSecrets(tmpApp, secretsOv.KeyToObj, bySvc); err != nil {
		_ = os.Remove(tmpData)
		_ = os.Remove(tmpApp)
		return expandedStack{}, err
	}
	if err := stack.InjectExternalConfigs(tmpApp, configsMap); err != nil {
		_ = os.Remove(tmpData)
		_ = os.Remove(tmpApp)
		return expandedStack{}, err
	}

	out := expandedStack{Data: tmpData, App: tmpApp, Secrets: secretsOv}
	if wantObs {
		tmpObs, err := expandFragment(ctx, "observability", home, []string{kit.ObsStackFile}, expandEnv, src, cfg.SyncEnvMap())
		if err != nil {
			_ = os.Remove(tmpData)
			_ = os.Remove(tmpApp)
			return expandedStack{}, err
		}
		if err := stack.InjectExternalConfigs(tmpObs, configsMap); err != nil {
			_ = os.Remove(tmpData)
			_ = os.Remove(tmpApp)
			_ = os.Remove(tmpObs)
			return expandedStack{}, err
		}
		out.Obs = tmpObs
	}
	return out, nil
}

func (e expandedStack) cleanup() {
	if e.Data != "" {
		_ = os.Remove(e.Data)
	}
	if e.App != "" {
		_ = os.Remove(e.App)
	}
	if e.Obs != "" {
		_ = os.Remove(e.Obs)
	}
}

func (e expandedStack) fullFiles() []string {
	files := []string{e.Data, e.App}
	if e.Obs != "" {
		files = append(files, e.Obs)
	}
	return files
}
