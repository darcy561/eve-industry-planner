package main

import (
	"eve-industry-planner/api/websocket/server"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"net/http"
)

func StartWSServer(clients *shared.ServiceClients) error {
	cfg := config.LoadConfig()

	wsServer := server.NewServer(clients)

	http.HandleFunc("/ws", wsServer.HandleWS)
	http.HandleFunc("/ws/", wsServer.HandleWS)

	addr := ":" + cfg.WS_PORT
	logs.Info("ws server starting", "addr", addr)

	return http.ListenAndServe(addr, nil)
}
