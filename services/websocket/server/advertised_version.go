package server

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"eve-industry-planner/shared/appconfig"
	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
)

var errAdvertisedVersionPubSubClosed = errors.New("advertised version: pubsub channel closed")

// startAdvertisedVersionWatcher listens for Redis PUBLISH when ops flips the train SoT
// and fans out {type:app_version} to every local socket (snackbar path on FE).
func (s *Server) startAdvertisedVersionWatcher() {
	if s.Stack == nil || s.Stack.Redis == nil {
		logs.WarnCtx(context.Background(), "advertised version watcher skipped: redis unavailable")
		return
	}
	go s.runAdvertisedVersionWatcher(s.Stack.Redis)
}

func (s *Server) runAdvertisedVersionWatcher(rdb *redis.Client) {
	ctx := context.Background()
	channel := appconfig.AdvertisedVersionChannel()

	for {
		err := s.subscribeAdvertisedVersion(ctx, rdb, channel)
		if err == nil || errors.Is(err, context.Canceled) {
			return
		}
		logs.WarnCtx(ctx, "advertised version subscribe ended; retrying",
			"error", err, "channel", channel)
		time.Sleep(2 * time.Second)
	}
}

func (s *Server) subscribeAdvertisedVersion(ctx context.Context, rdb *redis.Client, channel string) error {
	pubsub := rdb.Subscribe(ctx, channel)
	defer func() { _ = pubsub.Close() }()

	if _, err := pubsub.Receive(ctx); err != nil {
		return err
	}
	logs.InfoCtx(ctx, "advertised version watcher subscribed", "channel", channel)

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-ch:
			if !ok {
				return errAdvertisedVersionPubSubClosed
			}
			if msg == nil {
				continue
			}
			version := strings.TrimSpace(msg.Payload)
			if version == "" {
				continue
			}
			bake := appconfig.ProcessAppVersion()
			if bake != version {
				logs.InfoCtx(ctx, "advertised version differs from process bake",
					"advertised", version, "process", bake)
			}
			n := s.BroadcastAppVersion(version)
			logs.InfoCtx(ctx, "advertised version fan-out",
				"app_version", version, "queued", n)
		}
	}
}

func (s *Server) resolveAdvertisedAppVersion(ctx context.Context) string {
	var rdb *redis.Client
	if s.Stack != nil {
		rdb = s.Stack.Redis
	}
	return appconfig.ResolveAdvertisedAppVersion(ctx, rdb)
}

// BroadcastAppVersion queues an app_version frame to every local client Send buffer.
func (s *Server) BroadcastAppVersion(version string) int {
	version = strings.TrimSpace(version)
	if version == "" {
		return 0
	}
	payload, err := json.Marshal(map[string]string{
		"type":        "app_version",
		"app_version": version,
	})
	if err != nil {
		return 0
	}

	s.ClientsMu.RLock()
	clients := make([]*Client, 0, len(s.Clients))
	for _, c := range s.Clients {
		clients = append(clients, c)
	}
	s.ClientsMu.RUnlock()

	queued := 0
	for _, client := range clients {
		if client == nil {
			continue
		}
		select {
		case client.Send <- payload:
			queued++
		default:
			logs.DebugCtx(context.Background(), "app_version fan-out: send buffer full",
				"client_id", client.id)
		}
	}
	return queued
}
