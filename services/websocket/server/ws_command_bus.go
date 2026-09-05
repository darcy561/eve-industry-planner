package server

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/container"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
)

// StartWSCommandBus answers planned cordon, drain and uncordon for this replica.
// Every replica hears each command; only the one it names answers.
func (s *Server) StartWSCommandBus(ctx context.Context, natsHandle *eipnats.NATS) (lifecycle.Runner, error) {
	if s == nil {
		return nil, fmt.Errorf("websocket: StartWSCommandBus nil server")
	}
	stop, err := eipnats.SubscribeWSCommands(natsHandle, func(subject string, cmd eipnats.WSCommand) (eipnats.WSCommandAck, bool) {
		return s.handleWSCommand(ctx, subject, cmd)
	})
	if err != nil {
		return nil, fmt.Errorf("websocket: %w", err)
	}
	logs.InfoCtx(ctx, "websocket planned command bus enabled", "container_id", container.ID())
	return lifecycle.Func{
		RunnerName: "websocket-ws-command-bus",
		Fn:         func(context.Context) { stop() },
	}, nil
}

// handleWSCommand runs a command aimed at this container and reports what it did.
func (s *Server) handleWSCommand(ctx context.Context, subject string, cmd eipnats.WSCommand) (eipnats.WSCommandAck, bool) {
	self := container.ID()
	if cmd.ContainerID == "" || cmd.ContainerID != self {
		return eipnats.WSCommandAck{}, false
	}

	switch subject {
	case eipnats.SubjectWSCommandCordon:
		s.PlannedCordon(ctx)
		return eipnats.WSCommandAck{OK: true, ContainerID: self, Action: "cordon"}, true
	case eipnats.SubjectWSCommandDrain:
		s.PlannedDrain(ctx)
		return eipnats.WSCommandAck{OK: true, ContainerID: self, Action: "drain"}, true
	case eipnats.SubjectWSCommandUncordon:
		if err := s.PlannedUncordon(ctx); err != nil {
			return eipnats.WSCommandAck{OK: false, ContainerID: self, Action: "uncordon", Error: err.Error()}, true
		}
		return eipnats.WSCommandAck{OK: true, ContainerID: self, Action: "uncordon"}, true
	default:
		return eipnats.WSCommandAck{}, false
	}
}
