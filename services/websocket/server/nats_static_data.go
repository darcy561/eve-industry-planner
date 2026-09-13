package server

import (
	"context"
	"encoding/json"

	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/websocket/server/outgoinglogic"
)

// subscribeToStaticDataBuilds tells every connected client when a new Static Data
// Export build is published, so a session already open learns about it without
// asking on a timer.
//
// Core NATS rather than JetStream, like notifications: the announcement is only
// worth anything while a client is connected to hear it, and one replayed after a
// reconnect says nothing the client's own load-time check has not already told it.
func (s *Server) subscribeToStaticDataBuilds() {
	ctx := context.Background()
	if s.Stack == nil || s.Stack.NATS == nil {
		return
	}

	stop, err := eipnats.SubscribeSDEBuildUpdated(s.Stack.NATS, func(u eipnats.SDECurrentBuildUpdate) {
		payload, merr := json.Marshal(eipnats.StaticDataMessage{
			Type:        eipnats.ClientMessageStaticData,
			BuildNumber: u.BuildNumber,
			Version:     u.Version,
		})
		if merr != nil {
			logs.ErrorCtx(ctx, "static data build message", "component", "websocket", "error", merr)
			return
		}
		sent := s.broadcastRawToEveryClient(payload)
		logs.InfoCtx(ctx, "static data build announced",
			"component", "websocket",
			"build_number", u.BuildNumber,
			"version", u.Version,
			"recipients", sent,
		)
	})
	if err != nil {
		logs.ErrorCtx(ctx, "static data builds: subscribe", "component", "websocket", "error", err)
		return
	}

	go func() {
		<-s.shutdownChan
		stop()
	}()
}

// broadcastRawToEveryClient queues a pre-marshaled message to every local socket
// and returns how many took it.
//
// Unlike the tenant broadcasts next door this one checks nothing about who is
// listening, because the message belongs to nobody: the static data files are the
// same for every client and a signed-out one reads them too. A client whose send
// buffer is full is skipped rather than waited for — the announcement is a
// shortcut, and one that misses costs only the load-time check the client makes
// anyway.
func (s *Server) broadcastRawToEveryClient(data []byte) int {
	if s == nil || len(data) == 0 {
		return 0
	}
	s.ClientsMu.RLock()
	defer s.ClientsMu.RUnlock()

	sent := 0
	for _, client := range s.Clients {
		if client == nil {
			continue
		}
		if outgoinglogic.TrySendNonBlocking(client.Send, data) {
			sent++
		}
	}
	return sent
}
