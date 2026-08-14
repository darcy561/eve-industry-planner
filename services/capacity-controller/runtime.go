package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/hibiken/asynq"
	"github.com/moby/moby/client"
	redislib "github.com/redis/go-redis/v9"

	"eve-industry-planner/capacity-controller/cluster"
	"eve-industry-planner/capacity-controller/config"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/shared/telemetry"
)

type runtime struct {
	clients    *stackservices.Clients
	cfgHolder  *configHolder
	swarm      *cluster.Swarm
	policyPath string
	dockerHost string
}

func openRuntime(ctx context.Context, watchPolicy bool) (*runtime, func(), error) {
	teleShutdown, err := telemetry.Init(ctx, telemetry.DefaultConfig("capacity-controller"))
	if err != nil {
		return nil, nil, err
	}
	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Services{NATS: true, Redis: true})
	if err != nil {
		_ = teleShutdown(context.Background())
		return nil, nil, err
	}

	cfgHolder := &configHolder{}
	policyPath := envOr(policyPathEnv, defaultPolicyPath)
	if err := cfgHolder.reload(policyPath); err != nil {
		logs.WarnCtx(ctx, "capacity-controller: initial policy load failed; waiting for valid file",
			"path", policyPath, "error", err)
	}
	if watchPolicy {
		go cfgHolder.watch(ctx, policyPath)
	}

	dockerHost := envOr("DOCKER_HOST", "unix:///var/run/docker.sock")
	api, err := client.New(client.FromEnv, client.WithHost(dockerHost), client.WithTimeout(2*time.Minute))
	if err != nil {
		stopDeps(context.Background())
		_ = teleShutdown(context.Background())
		return nil, nil, fmt.Errorf("docker client: %w", err)
	}

	swarm := cluster.NewSwarm(cluster.SwarmOptions{
		Docker: api,
		Redis:  clients.Redis,
		NATS:   clients.NATS,
		Asynq:  newAsynqInspector(clients.Redis),
		Stack:  envOr("EIP_STACK_NAME", "eip"),
		Cfg:    cfgHolder.get,
	})

	cleanup := func() {
		_ = api.Close()
		stopDeps(context.Background())
		_ = teleShutdown(context.Background())
	}
	return &runtime{
		clients:    clients,
		cfgHolder:  cfgHolder,
		swarm:      swarm,
		policyPath: policyPath,
		dockerHost: dockerHost,
	}, cleanup, nil
}

func envOr(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}

func newAsynqInspector(rdb *redislib.Client) *asynq.Inspector {
	if rdb == nil {
		return nil
	}
	return asynq.NewInspector(asynq.RedisClientOpt{
		Addr:     rdb.Options().Addr,
		Username: rdb.Options().Username,
		Password: rdb.Options().Password,
		DB:       rdb.Options().DB,
	})
}

type configHolder struct {
	mu  sync.RWMutex
	cfg config.Config
	ok  bool
	err error
}

func (h *configHolder) get() config.Config {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.cfg
}

func (h *configHolder) getOK() (config.Config, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if !h.ok {
		if h.err != nil {
			return config.Config{}, h.err
		}
		return config.Config{}, fmt.Errorf("policy not loaded")
	}
	return h.cfg, nil
}

func (h *configHolder) reload(path string) error {
	cfg, err := config.LoadFile(path)
	h.mu.Lock()
	defer h.mu.Unlock()
	if err != nil {
		h.ok = false
		h.err = err
		return err
	}
	h.cfg = cfg
	h.ok = true
	h.err = nil
	return nil
}

func (h *configHolder) watch(ctx context.Context, path string) {
	var lastMod time.Time
	if st, err := os.Stat(path); err == nil {
		lastMod = st.ModTime()
	}
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			st, err := os.Stat(path)
			if err != nil {
				continue
			}
			if st.ModTime().Equal(lastMod) {
				continue
			}
			lastMod = st.ModTime()
			if err := h.reload(path); err != nil {
				logs.WarnCtx(ctx, "capacity-controller: policy reload failed", "error", err)
				continue
			}
			logs.InfoCtx(ctx, "capacity-controller: policy reloaded", "path", path)
		}
	}
}
