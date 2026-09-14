package nats

import (
	"fmt"
	"slices"
	"strings"

	natslib "github.com/nats-io/nats.go"
)

// Audience names who a message is for, separately from what it means.
//
// It chooses a fan-out and nothing else. The websocket service is its only
// reader and it never crosses to a browser, which already knows it is a
// recipient — so audience does not enter the type / subtype vocabulary in
// [ClientMessageKinds] or the corpus both sides are checked against.
type Audience string

const (
	AudienceEveryone    Audience = "everyone"
	AudienceSubscribers Audience = "subscribers"
)

const (
	// subjectDeliver prefixes every audience-addressed subject. Callers name a
	// subject through DeliverSubject rather than assembling one.
	subjectDeliver = "deliver"
	// DeliverFilter matches the whole audience subject space.
	DeliverFilter = subjectDeliver + ".>"
	// TargetEveryone stands in the target slot for an audience that addresses no
	// owner. The shape is a fixed four tokens so one parser reads every audience
	// and the space lists uniformly in NATS tooling.
	TargetEveryone = "all"
)

// Delivery is a resolved audience and its target, built by the constructors
// below so a target cannot go missing from an audience that needs one or be
// attached to one that does not.
type Delivery struct {
	audience Audience
	target   string
}

// Everyone addresses every connected socket.
func Everyone() Delivery {
	return Delivery{audience: AudienceEveryone, target: TargetEveryone}
}

// Subscribers addresses the connections working in the owner the key names.
func Subscribers(ownerKey string) Delivery {
	return Delivery{audience: AudienceSubscribers, target: strings.TrimSpace(ownerKey)}
}

// DeliverSubject builds deliver.{audience}.{target}.{family}.{subtype}.
//
// The family rides the subject rather than being read out of the frame, because
// the frame is forwarded unparsed and the delivery side keys its policy on the
// family. It is also what makes a subject readable in NATS tooling without
// opening the body.
//
// Returns "" if any segment is empty or holds a dot, which would silently split
// into an extra token and address a subject nobody subscribes to.
func DeliverSubject(to Delivery, family, subtype string) string {
	family = strings.TrimSpace(family)
	subtype = strings.TrimSpace(subtype)
	segments := []string{string(to.audience), to.target, family, subtype}
	for _, s := range segments {
		if s == "" || strings.ContainsAny(s, ". *>") {
			return ""
		}
	}
	return subjectDeliver + "." + strings.Join(segments, ".")
}

// AudienceMessage is one delivered message: who it is for, and the frame to
// forward.
type AudienceMessage struct {
	Audience Audience
	// Target is the owner key the audience reads, or [TargetEveryone].
	Target string
	// Family is the client message type, which the delivery side keys its policy
	// on without reading the frame.
	Family  string
	Subtype string
	// Payload is the client frame as published. The websocket service forwards
	// it without parsing: the frame is the browser's vocabulary and this layer
	// carries it rather than shaping it.
	Payload []byte
}

// parseDeliverSubject splits deliver.{audience}.{target}.{family}.{subtype}.
func parseDeliverSubject(subject string) (AudienceMessage, bool) {
	rest, found := strings.CutPrefix(subject, subjectDeliver+".")
	if !found {
		return AudienceMessage{}, false
	}
	parts := strings.Split(rest, ".")
	if len(parts) != 4 {
		return AudienceMessage{}, false
	}
	if slices.Contains(parts, "") {
		return AudienceMessage{}, false
	}
	return AudienceMessage{
		Audience: Audience(parts[0]),
		Target:   parts[1],
		Family:   parts[2],
		Subtype:  parts[3],
	}, true
}

// PublishToAudience sends a pre-built client frame to an audience.
//
// Core NATS, unacknowledged, like the families it carries: these messages say
// something happened now, and one replayed after a reconnect is worse than
// none.
//
// The frame is published as the caller built it. Producing it here would make
// this the place the browser's vocabulary is decided, and audience is meant to
// be the dimension that does not touch it.
func PublishToAudience(n *NATS, to Delivery, family, subtype string, frame []byte) error {
	if n == nil || n.conn == nil {
		return fmt.Errorf("nats connection is required")
	}
	if len(frame) == 0 {
		return fmt.Errorf("a message to %s needs a frame", to.audience)
	}
	subject := DeliverSubject(to, family, subtype)
	if subject == "" {
		return fmt.Errorf("audience %q, target %q, family %q and subtype %q do not name a subject",
			to.audience, to.target, family, subtype)
	}
	if err := n.conn.Publish(subject, frame); err != nil {
		return fmt.Errorf("publish %s: %w", subject, err)
	}
	return nil
}

// SubscribeAudience calls handle for every audience-addressed message.
//
// One wildcard subscription for every audience and every target: delivery is
// where connectedness is known, and a subscription that never changes cannot
// fall out of step with a set of owners that does.
func SubscribeAudience(n *NATS, handle func(AudienceMessage)) (stop func(), err error) {
	if n == nil || n.conn == nil {
		return nil, fmt.Errorf("nats connection is required")
	}
	sub, serr := n.conn.Subscribe(DeliverFilter, func(msg *natslib.Msg) {
		parsed, ok := parseDeliverSubject(msg.Subject)
		if !ok {
			return
		}
		parsed.Payload = make([]byte, len(msg.Data))
		copy(parsed.Payload, msg.Data)
		handle(parsed)
	})
	if serr != nil {
		return nil, fmt.Errorf("subscribe %s: %w", DeliverFilter, serr)
	}
	return func() { _ = sub.Unsubscribe() }, nil
}
