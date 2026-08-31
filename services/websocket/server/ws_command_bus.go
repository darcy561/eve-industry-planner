package server

import (
	"context"
	"encoding/json"
	"fmt"

	"eve-industry-planner/shared/container"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"

	natslib "github.com/nats-io/nats.go"
)

// StartWSCommandBus subscribes to planned cordon/drain/uncordon (no queue group).
// Each replica Responds only when container_id matches this process.
func (s *Server) StartWSCommandBus(ctx context.Context, conn *natslib.Conn) (lifecycle.Runner, error) {
	if s == nil {
		return nil, fmt.Errorf("websocket: StartWSCommandBus nil server")
	}
	if conn == nil {
		return nil, fmt.Errorf("websocket: StartWSCommandBus nil conn")
	}
	subs := make([]*natslib.Subscription, 0, 3)
	for _, subject := range []string{
		eipnats.SubjectWSCommandCordon,
		eipnats.SubjectWSCommandDrain,
		eipnats.SubjectWSCommandUncordon,
	} {
		subj := subject
		sub, err := conn.Subscribe(subj, func(msg *natslib.Msg) {
			s.handleWSCommand(ctx, subj, msg)
		})
		if err != nil {
			for _, prev := range subs {
				_ = prev.Unsubscribe()
			}
			return nil, fmt.Errorf("websocket: subscribe %s: %w", subj, err)
		}
		subs = append(subs, sub)
	}
	logs.InfoCtx(ctx, "websocket planned command bus enabled",
		"container_id", container.ID(),
		"subjects", []string{
			eipnats.SubjectWSCommandCordon,
			eipnats.SubjectWSCommandDrain,
			eipnats.SubjectWSCommandUncordon,
		},
	)
	return lifecycle.Func{
		RunnerName: "websocket-ws-command-bus",
		Fn: func(context.Context) {
			for _, sub := range subs {
				_ = sub.Unsubscribe()
			}
		},
	}, nil
}

func (s *Server) handleWSCommand(ctx context.Context, subject string, msg *natslib.Msg) {
	if msg == nil {
		return
	}
	cmd, ok := parseWSCommand(msg.Data)
	if !ok {
		return
	}
	self := container.ID()
	if cmd.ContainerID == "" || cmd.ContainerID != self {
		return
	}

	action := ""
	switch subject {
	case eipnats.SubjectWSCommandCordon:
		action = "cordon"
		s.PlannedCordon(ctx)
	case eipnats.SubjectWSCommandDrain:
		action = "drain"
		s.PlannedDrain(ctx)
	case eipnats.SubjectWSCommandUncordon:
		action = "uncordon"
		if err := s.PlannedUncordon(ctx); err != nil {
			_ = eipnats.RespondEnvelope(msg, eipnats.MessageTypeWSCommand, eipnats.WSCommandAck{
				OK: false, ContainerID: self, Action: action, Error: err.Error(),
			})
			return
		}
	default:
		return
	}
	if err := eipnats.RespondEnvelope(msg, eipnats.MessageTypeWSCommand, eipnats.WSCommandAck{
		OK: true, ContainerID: self, Action: action,
	}); err != nil {
		logs.WarnCtx(ctx, "websocket ws.command Respond failed",
			"error", err, "subject", subject, "container_id", self)
	}
}

func parseWSCommand(data []byte) (eipnats.WSCommand, bool) {
	var env eipnats.Message
	if err := json.Unmarshal(data, &env); err == nil && env.Type != "" {
		if len(env.Data) == 0 {
			return eipnats.WSCommand{}, false
		}
		var cmd eipnats.WSCommand
		if err := json.Unmarshal(env.Data, &cmd); err != nil {
			return eipnats.WSCommand{}, false
		}
		return cmd, true
	}
	var cmd eipnats.WSCommand
	if err := json.Unmarshal(data, &cmd); err != nil {
		return eipnats.WSCommand{}, false
	}
	return cmd, true
}
