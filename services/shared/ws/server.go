package ws

import (
	"eve-industry-planner/shared/shared/logs"
)

func StartServer(addr string) error {
	logs.Info("ws server starting", "addr", addr)
	return nil
}
