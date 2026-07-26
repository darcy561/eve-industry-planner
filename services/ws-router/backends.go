package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"eve-industry-planner/shared/orchestrationprobes"
)

type backend struct {
	Slot       string
	IP         string
	AppVersion string // from task Spec.ContainerSpec.Env APP_VERSION (empty if unset)
}

type backendRegistry struct {
	cfg        config
	dockerHTTP *http.Client
	dockerBase string // http://docker (unix) or http://host:2375 (tcp proxy)
	probeHTTP  *http.Client
	mu         sync.RWMutex
	bySlot     map[string]backend // only probe-ready backends
}

func newBackendRegistry(cfg config) *backendRegistry {
	base, unixSock := parseDockerHost(cfg.DockerHost)
	dockerTransport := &http.Transport{}
	if unixSock != "" {
		sock := unixSock
		dockerTransport.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "unix", sock)
		}
	}
	return &backendRegistry{
		cfg:        cfg,
		dockerBase: base,
		dockerHTTP: &http.Client{
			Transport: dockerTransport,
			Timeout:   5 * time.Second,
		},
		probeHTTP: &http.Client{
			Timeout: cfg.BackendProbeTimeout,
		},
		bySlot: map[string]backend{},
	}
}

// parseDockerHost returns an HTTP base URL and optional unix socket path.
// Supports unix:///path, tcp://host:port, http://host:port.
func parseDockerHost(dockerHost string) (baseURL, unixSock string) {
	h := strings.TrimSpace(dockerHost)
	switch {
	case strings.HasPrefix(h, "unix://"):
		return "http://docker", strings.TrimPrefix(h, "unix://")
	case strings.HasPrefix(h, "tcp://"):
		return "http://" + strings.TrimPrefix(h, "tcp://"), ""
	case strings.HasPrefix(h, "http://") || strings.HasPrefix(h, "https://"):
		return strings.TrimRight(h, "/"), ""
	default:
		return "http://docker", "/var/run/docker.sock"
	}
}

func (b *backendRegistry) pollLoop(ctx context.Context) {
	t := time.NewTicker(b.cfg.BackendPollEvery)
	defer t.Stop()
	b.refresh(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			b.refresh(ctx)
		}
	}
}

func (b *backendRegistry) refresh(ctx context.Context) {
	slots, err := b.fetchRunningSlots(ctx)
	if err != nil {
		log.Printf("backend refresh: %v", err)
		return
	}
	ready := b.filterProbeReady(ctx, slots)
	b.mu.Lock()
	b.bySlot = ready
	b.mu.Unlock()
}

// filterProbeReady keeps backends whose orchestrationprobes /ready returns 200.
func (b *backendRegistry) filterProbeReady(ctx context.Context, slots map[string]backend) map[string]backend {
	if len(slots) == 0 {
		return map[string]backend{}
	}
	type result struct {
		slot string
		be   backend
		ok   bool
	}
	ch := make(chan result, len(slots))
	var wg sync.WaitGroup
	for slot, be := range slots {
		wg.Add(1)
		go func(slot string, be backend) {
			defer wg.Done()
			ch <- result{slot: slot, be: be, ok: b.probeReady(ctx, be.IP)}
		}(slot, be)
	}
	wg.Wait()
	close(ch)
	out := map[string]backend{}
	for r := range ch {
		if r.ok {
			out[r.slot] = r.be
		}
	}
	return out
}

func (b *backendRegistry) probeReady(ctx context.Context, ip string) bool {
	if ip == "" {
		return false
	}
	host := ip
	if strings.Contains(ip, ":") && !strings.HasPrefix(ip, "[") {
		host = "[" + ip + "]"
	}
	u := fmt.Sprintf("http://%s:%s/ready", host, orchestrationprobes.ListenPort)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return false
	}
	resp, err := b.probeHTTP.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64))
	return resp.StatusCode == http.StatusOK
}

func (b *backendRegistry) snapshot() map[string]backend {
	b.mu.RLock()
	defer b.mu.RUnlock()
	out := make(map[string]backend, len(b.bySlot))
	for k, v := range b.bySlot {
		out[k] = v
	}
	return out
}

func (b *backendRegistry) count() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.bySlot)
}

func (b *backendRegistry) get(slot string) (backend, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	be, ok := b.bySlot[slot]
	return be, ok
}

func (b *backendRegistry) sortedSlots() []string {
	snap := b.snapshot()
	keys := make([]string, 0, len(snap))
	for k := range snap {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

type dockerTaskList []struct {
	Slot   int `json:"Slot"`
	Status struct {
		State string `json:"State"`
	} `json:"Status"`
	Spec struct {
		ContainerSpec struct {
			Env []string `json:"Env"`
		} `json:"ContainerSpec"`
	} `json:"Spec"`
	NetworksAttachments []struct {
		Addresses []string `json:"Addresses"`
	} `json:"NetworksAttachments"`
}

func (b *backendRegistry) fetchRunningSlots(ctx context.Context) (map[string]backend, error) {
	svcID, err := b.resolveServiceID(ctx)
	if err != nil {
		return nil, err
	}
	filters := url.QueryEscape(fmt.Sprintf(`{"service":["%s"],"desired-state":["running"]}`, svcID))
	body, err := b.dockerGET(ctx, "/tasks?filters="+filters)
	if err != nil {
		return nil, err
	}
	var tasks dockerTaskList
	if err := json.Unmarshal(body, &tasks); err != nil {
		return nil, fmt.Errorf("decode tasks: %w", err)
	}
	out := map[string]backend{}
	for _, t := range tasks {
		if !strings.EqualFold(t.Status.State, "running") {
			continue
		}
		slot := slotIDFromTask(t.Slot, t.Spec.ContainerSpec.Env)
		var groups [][]string
		for _, na := range t.NetworksAttachments {
			groups = append(groups, na.Addresses)
		}
		ip := firstIP(groups)
		if ip == "" || t.Slot < 1 {
			continue
		}
		out[slot] = backend{
			Slot:       slot,
			IP:         ip,
			AppVersion: envValue(t.Spec.ContainerSpec.Env, "APP_VERSION"),
		}
	}
	return out, nil
}

func envValue(env []string, key string) string {
	prefix := key + "="
	for _, e := range env {
		if strings.HasPrefix(e, prefix) {
			v := strings.TrimPrefix(e, prefix)
			if strings.Contains(v, "{{") {
				return ""
			}
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func (b *backendRegistry) resolveServiceID(ctx context.Context) (string, error) {
	filters := url.QueryEscape(fmt.Sprintf(`{"name":["%s"]}`, b.cfg.WebsocketService))
	body, err := b.dockerGET(ctx, "/services?filters="+filters)
	if err != nil {
		return "", err
	}
	var services []struct {
		ID   string `json:"ID"`
		Spec struct {
			Name string `json:"Name"`
		} `json:"Spec"`
	}
	if err := json.Unmarshal(body, &services); err != nil {
		return "", fmt.Errorf("decode services: %w", err)
	}
	for _, s := range services {
		if s.Spec.Name == b.cfg.WebsocketService {
			return s.ID, nil
		}
	}
	if len(services) == 1 {
		return services[0].ID, nil
	}
	return "", fmt.Errorf("service %q not found", b.cfg.WebsocketService)
}

func (b *backendRegistry) dockerGET(ctx context.Context, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, b.dockerBase+path, nil)
	if err != nil {
		return nil, err
	}
	resp, err := b.dockerHTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("docker %s: %s: %s", path, resp.Status, truncate(string(body), 200))
	}
	return body, nil
}

func firstIP(addresses [][]string) string {
	for _, group := range addresses {
		for _, addr := range group {
			raw := strings.Split(addr, "/")[0]
			if ip := net.ParseIP(raw); ip != nil {
				return ip.String()
			}
		}
	}
	return ""
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// slotIDFromTask maps a Swarm task to a stable backend key.
// Prefer Task.Slot — Spec.ContainerSpec.Env still holds Swarm template literals
// (e.g. websocket-{{.Task.Slot}}), not the runtime-resolved value.
func slotIDFromTask(slot int, env []string) string {
	id := fmt.Sprintf("websocket-%d", slot)
	for _, e := range env {
		if strings.HasPrefix(e, "OTEL_SERVICE_INSTANCE_ID=") {
			v := strings.TrimPrefix(e, "OTEL_SERVICE_INSTANCE_ID=")
			if v != "" && !strings.Contains(v, "{{") {
				return v
			}
		}
	}
	return id
}
