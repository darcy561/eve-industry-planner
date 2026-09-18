package nats

import (
	"context"
	"encoding/json/jsontext"
	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	"fmt"
	"strings"
	"time"

	natslib "github.com/nats-io/nats.go"
)

// Topic helpers. One pair per subject, so a caller names what it is announcing
// or asking for and the compiler checks the payload.

// PublishSDEBuildUpdated announces that the live Static Data Export changed.
// Subscribers refresh what they derived from the old build.
func PublishSDEBuildUpdated(n *NATS, buildNumber int, version string) error {
	return n.publishTopic(SubjectCoreSDEBuildUpdated, SDECurrentBuildUpdate{
		BuildNumber: buildNumber,
		Version:     version,
	})
}

// SubscribeSDEBuildUpdated calls handle when the live Static Data Export changes.
func SubscribeSDEBuildUpdated(n *NATS, handle func(SDECurrentBuildUpdate)) (stop func(), err error) {
	return subscribeTopic(n, SubjectCoreSDEBuildUpdated, handle)
}

// SubtypeStaticDataBuildUpdated labels the announcement on its subject.
//
// A subject segment for routing and tooling, not a client subtype: the
// staticData family has none, and what the browser reads is the frame below.
const SubtypeStaticDataBuildUpdated = "sdeBuildUpdated"

// AnnounceStaticDataBuild tells every connected browser that a new Static Data
// Export build is live, so a session already open learns about it without asking
// on a timer.
//
// Separate from [PublishSDEBuildUpdated], which is the internal event the
// services deriving from a build listen for. This one is addressed to people: it
// goes to every socket whether or not anyone is signed in, and it carries the
// build so a client already holding it stays quiet.
func AnnounceStaticDataBuild(n *NATS, buildNumber int, version string) error {
	frame, err := jsoncodec.Marshal(StaticDataMessage{
		Type:        ClientMessageStaticData,
		BuildNumber: buildNumber,
		Version:     version,
	})
	if err != nil {
		return fmt.Errorf("marshal static data announcement: %w", err)
	}
	return PublishToAudience(n, Everyone(), ClientMessageStaticData, SubtypeStaticDataBuildUpdated, frame)
}

// PublishPlacementState announces one websocket replica's current load, which
// ws-router uses to place new clients.
func PublishPlacementState(n *NATS, state PlacementState) error {
	return n.publishTopic(SubjectWSPlacementState, state)
}

// SubscribePlacementState calls handle as replicas announce their load.
func SubscribePlacementState(n *NATS, handle func(PlacementState)) (stop func(), err error) {
	return subscribeTopic(n, SubjectWSPlacementState, handle)
}

// PublishSessionGrantsChanged announces an account's new ceiling.
//
// Core NATS rather than the stream: a replica that misses one re-derives every
// connection's scopes from the stored record at connect, and the stored record
// is already correct by the time this is published — so a miss costs one
// connection's lifetime of staleness rather than a lost revocation.
func PublishSessionGrantsChanged(n *NATS, accountID string, granted models.OwnerKeys) error {
	return n.publishTopic(SubjectSessionGrantsChanged, SessionGrantsChanged{
		AccountID: accountID,
		Granted:   granted,
	})
}

// SubscribeSessionGrantsChanged calls handle as accounts' ceilings change.
func SubscribeSessionGrantsChanged(n *NATS, handle func(SessionGrantsChanged)) (stop func(), err error) {
	return subscribeTopic(n, SubjectSessionGrantsChanged, handle)
}

// PublishMaintenanceState announces that the maintenance flag changed value.
func PublishMaintenanceState(n *NATS, enabled bool) error {
	return n.publishTopic(SubjectAppConfigMaintenanceState, MaintenanceState{Enabled: enabled})
}

// SubscribeMaintenanceState calls handle each time the maintenance flag changes.
func SubscribeMaintenanceState(n *NATS, handle func(MaintenanceState)) (stop func(), err error) {
	return subscribeTopic(n, SubjectAppConfigMaintenanceState, handle)
}

// AskMaintenanceState requests the flag's current value and returns the first
// answer.
func AskMaintenanceState(ctx context.Context, n *NATS, wait time.Duration) (MaintenanceState, error) {
	if n == nil || n.conn == nil {
		return MaintenanceState{}, fmt.Errorf("nats connection is required")
	}
	if wait <= 0 {
		wait = 5 * time.Second
	}
	reqCtx, cancel := context.WithTimeout(ctx, wait)
	defer cancel()

	msg, err := n.conn.RequestWithContext(reqCtx, SubjectAppConfigMaintenanceAsk, nil)
	if err != nil {
		return MaintenanceState{}, fmt.Errorf("%s: %w", SubjectAppConfigMaintenanceAsk, err)
	}
	var state MaintenanceState
	if err := jsoncodec.Unmarshal(msg.Data, &state); err != nil {
		return MaintenanceState{}, fmt.Errorf("%s: unreadable reply: %w", SubjectAppConfigMaintenanceAsk, err)
	}
	return state, nil
}

// SubscribeMaintenanceAsk answers the current-value ask with current().
func SubscribeMaintenanceAsk(n *NATS, current func() bool) (stop func(), err error) {
	if n == nil || n.conn == nil {
		return nil, fmt.Errorf("nats connection is required")
	}
	sub, err := n.conn.Subscribe(SubjectAppConfigMaintenanceAsk, func(msg *natslib.Msg) {
		_ = respondJSON(msg, MaintenanceState{Enabled: current()})
	})
	if err != nil {
		return nil, fmt.Errorf("subscribe %s: %w", SubjectAppConfigMaintenanceAsk, err)
	}
	return func() { _ = sub.Unsubscribe() }, nil
}

// GatherHealth asks every replica to report, and returns what answered within
// wait. An empty role asks all roles. The result is a census: replicas that do
// not answer are absent from it, which is the question being asked.
func GatherHealth(ctx context.Context, n *NATS, role string, wait time.Duration) ([]HealthStatus, error) {
	replies, err := gather[Message](ctx, n, SubjectHealthCommandPing, HealthPing{Role: role}, wait)
	if err != nil {
		return nil, err
	}
	out := make([]HealthStatus, 0, len(replies))
	for _, envelope := range replies {
		status, ok := decodeHealthStatus(envelope)
		if !ok {
			continue
		}
		out = append(out, status)
	}
	return out, nil
}

// SubscribeHealthPings answers the census for this replica. Every replica
// answers — no queue group — because the caller is counting them.
func SubscribeHealthPings(n *NATS, reply func(ping HealthPing) (HealthStatus, bool)) (stop func(), err error) {
	if n == nil || n.conn == nil {
		return nil, fmt.Errorf("nats connection is required")
	}
	sub, err := n.conn.Subscribe(SubjectHealthCommandPing, func(msg *natslib.Msg) {
		status, answer := reply(parseHealthPing(msg.Data))
		if !answer {
			return
		}
		_ = RespondEnvelope(msg, MessageTypeHealth, status)
	})
	if err != nil {
		return nil, err
	}
	return func() { _ = sub.Unsubscribe() }, nil
}

// decodeHealthStatus reads a census reply, which arrives in the shared envelope.
func decodeHealthStatus(envelope Message) (HealthStatus, bool) {
	if envelope.Type != MessageTypeHealth || len(envelope.Data) == 0 {
		return HealthStatus{}, false
	}
	var status HealthStatus
	if err := jsoncodec.Unmarshal(envelope.Data, &status); err != nil {
		return HealthStatus{}, false
	}
	return status, true
}

// parseHealthPing reads a ping, which may be a bare payload or wrapped. Anything
// unreadable means every role should answer, since a census defaults to all.
func parseHealthPing(data []byte) HealthPing {
	if len(data) == 0 {
		return HealthPing{}
	}
	var envelope Message
	if err := jsoncodec.Unmarshal(data, &envelope); err == nil && envelope.Type != "" {
		if len(envelope.Data) == 0 {
			return HealthPing{}
		}
		var ping HealthPing
		if err := jsoncodec.Unmarshal(envelope.Data, &ping); err != nil {
			return HealthPing{}
		}
		return ping
	}
	var ping HealthPing
	if err := jsoncodec.Unmarshal(data, &ping); err != nil {
		return HealthPing{}
	}
	return ping
}

// RequestWSCommand asks the websocket replica owning containerID to cordon,
// drain or uncordon itself, and waits for that replica's answer. Every replica
// hears the request; only the one it names replies, so a timeout means the
// container is not there.
func RequestWSCommand(ctx context.Context, n *NATS, subject, containerID string, wait time.Duration) (WSCommandAck, error) {
	if n == nil || n.conn == nil {
		return WSCommandAck{}, fmt.Errorf("nats connection is required")
	}
	containerID = strings.TrimSpace(containerID)
	if containerID == "" {
		return WSCommandAck{}, fmt.Errorf("%s: container id is required", subject)
	}
	raw, err := jsoncodec.Marshal(WSCommand{ContainerID: containerID})
	if err != nil {
		return WSCommandAck{}, err
	}
	if wait <= 0 {
		wait = 5 * time.Second
	}
	reqCtx, cancel := context.WithTimeout(ctx, wait)
	defer cancel()

	msg, err := n.conn.RequestWithContext(reqCtx, subject, raw)
	if err != nil {
		return WSCommandAck{}, fmt.Errorf("%s %s: %w", subject, containerID, err)
	}
	ack, ok := decodeWSCommandAck(msg.Data)
	if !ok {
		return WSCommandAck{}, fmt.Errorf("%s %s: unreadable ack", subject, containerID)
	}
	return ack, nil
}

// SubscribeWSCommands answers cordon, drain and uncordon for this replica.
// reply returns false for a command aimed at some other container.
func SubscribeWSCommands(n *NATS, reply func(subject string, cmd WSCommand) (WSCommandAck, bool)) (stop func(), err error) {
	if n == nil || n.conn == nil {
		return nil, fmt.Errorf("nats connection is required")
	}
	subs := make([]*natslib.Subscription, 0, 3)
	for _, subject := range []string{SubjectWSCommandCordon, SubjectWSCommandDrain, SubjectWSCommandUncordon} {
		sub, err := n.conn.Subscribe(subject, func(msg *natslib.Msg) {
			var cmd WSCommand
			if err := jsoncodec.Unmarshal(msg.Data, &cmd); err != nil {
				return
			}
			ack, answer := reply(msg.Subject, cmd)
			if !answer {
				return
			}
			_ = RespondEnvelope(msg, MessageTypeWSCommand, ack)
		})
		if err != nil {
			for _, prev := range subs {
				_ = prev.Unsubscribe()
			}
			return nil, fmt.Errorf("subscribe %s: %w", subject, err)
		}
		subs = append(subs, sub)
	}
	return func() {
		for _, sub := range subs {
			_ = sub.Unsubscribe()
		}
	}, nil
}

// decodeWSCommandAck reads an ack, which arrives in the shared envelope.
func decodeWSCommandAck(data []byte) (WSCommandAck, bool) {
	var envelope Message
	if err := jsoncodec.Unmarshal(data, &envelope); err == nil && envelope.Type != "" {
		if len(envelope.Data) == 0 {
			return WSCommandAck{}, false
		}
		var ack WSCommandAck
		if err := jsoncodec.Unmarshal(envelope.Data, &ack); err != nil {
			return WSCommandAck{}, false
		}
		return ack, true
	}
	var ack WSCommandAck
	if err := jsoncodec.Unmarshal(data, &ack); err != nil {
		return WSCommandAck{}, false
	}
	return ack, true
}

// Core-NATS topics: fan-out and request/reply that carry no persistence and no
// delivery guarantee. A subscriber that is not listening when one is published
// has missed it, which is the point — these say what is true now.

// publishTopic sends a payload on a core-NATS subject.
func (n *NATS) publishTopic(subject string, payload any) error {
	if n == nil || n.conn == nil {
		return fmt.Errorf("nats connection is required")
	}
	data, err := jsoncodec.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal %s: %w", subject, err)
	}
	if err := n.conn.Publish(subject, data); err != nil {
		return fmt.Errorf("publish %s: %w", subject, err)
	}
	return nil
}

// subscribeTopic delivers decoded payloads until the returned stop is called.
// A message that will not decode is dropped with a warning: the subject is a
// broadcast, so one bad publisher must not stop the subscriber.
func subscribeTopic[T any](n *NATS, subject string, handle func(T)) (stop func(), err error) {
	if n == nil || n.conn == nil {
		return nil, fmt.Errorf("nats connection is required")
	}
	sub, err := n.conn.Subscribe(subject, func(msg *natslib.Msg) {
		var payload T
		if err := jsoncodec.Unmarshal(msg.Data, &payload); err != nil {
			logs.WarnCtx(context.Background(), "dropping undecodable message", "subject", subject, "error", err)
			return
		}
		handle(payload)
	})
	if err != nil {
		return nil, fmt.Errorf("subscribe %s: %w", subject, err)
	}
	return func() { _ = sub.Unsubscribe() }, nil
}

// gather sends a request and collects every reply that arrives within wait.
// Used where the answer is a census rather than one response: each replica
// answers for itself, and how many exist is what the caller is asking.
func gather[T any](ctx context.Context, n *NATS, subject string, request any, wait time.Duration) ([]T, error) {
	if n == nil || n.conn == nil {
		return nil, fmt.Errorf("nats connection is required")
	}
	data, err := jsoncodec.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("marshal %s request: %w", subject, err)
	}

	inbox := n.conn.NewRespInbox()
	replies := make(chan []byte, 64)
	sub, err := n.conn.Subscribe(inbox, func(msg *natslib.Msg) {
		select {
		case replies <- msg.Data:
		default:
		}
	})
	if err != nil {
		return nil, fmt.Errorf("subscribe inbox for %s: %w", subject, err)
	}
	defer func() { _ = sub.Unsubscribe() }()

	if err := n.conn.PublishRequest(subject, inbox, data); err != nil {
		return nil, fmt.Errorf("request %s: %w", subject, err)
	}
	if err := n.conn.Flush(); err != nil {
		return nil, fmt.Errorf("flush %s request: %w", subject, err)
	}

	deadline := time.NewTimer(wait)
	defer deadline.Stop()

	var out []T
	for {
		select {
		case raw := <-replies:
			var reply T
			if err := jsoncodec.Unmarshal(raw, &reply); err != nil {
				logs.WarnCtx(ctx, "dropping undecodable reply", "subject", subject, "error", err)
				continue
			}
			out = append(out, reply)
		case <-deadline.C:
			return out, nil
		case <-ctx.Done():
			return out, ctx.Err()
		}
	}
}

// RespondJSON marshals v and sends it as a core-NATS reply (msg.Respond).
func respondJSON(msg *natslib.Msg, v any) error {
	if msg == nil {
		return fmt.Errorf("nats: RespondJSON nil msg")
	}
	data, err := jsoncodec.Marshal(v)
	if err != nil {
		return fmt.Errorf("nats: RespondJSON marshal: %w", err)
	}
	if err := msg.Respond(data); err != nil {
		return fmt.Errorf("nats: RespondJSON: %w", err)
	}
	return nil
}

// RespondEnvelope wraps payload in Message{Type, Data} and Responds.
func RespondEnvelope(msg *natslib.Msg, typ string, payload any) error {
	var data jsontext.Value
	if payload != nil {
		b, err := jsoncodec.Marshal(payload)
		if err != nil {
			return fmt.Errorf("nats: RespondEnvelope marshal payload: %w", err)
		}
		data = b
	}
	return respondJSON(msg, Message{Type: typ, Data: data})
}
