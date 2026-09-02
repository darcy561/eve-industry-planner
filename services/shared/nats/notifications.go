package nats

import (
	"encoding/json"
	"fmt"
	"strings"

	natslib "github.com/nats-io/nats.go"
)

// SubjectNotify is the subject prefix for client notifications.
const SubjectNotify = "notify"

// NotificationSubject builds notify.{tenantString}.{subtype}.
//
// A notification has no collection and no document id, so it cannot ride the
// document subject without pretending to be a document. It gets its own family
// instead; the tenant construction and hosted-tenant set are the same.
//
// Returns "" if either segment is empty after trim.
func NotificationSubject(tenantString, subtype string) string {
	tenantString = strings.TrimSpace(tenantString)
	subtype = strings.TrimSpace(subtype)
	if tenantString == "" || subtype == "" {
		return ""
	}
	return fmt.Sprintf("%s.%s.%s", SubjectNotify, tenantString, subtype)
}

// NotificationFilter matches every notification for every tenant.
const NotificationFilter = SubjectNotify + ".>"

// Notification is one delivered message: who it is for, what it says, and the
// body to forward.
type Notification struct {
	TenantString string
	Subtype      string
	// Payload is the client envelope as published, ready to forward. The
	// websocket service does not rebuild it: the tenant is in the subject and the
	// body carries nothing to route on or strip.
	Payload []byte
}

// PublishAccountNotification tells one account's clients that something
// happened.
//
// Core NATS, not JetStream, and published without acknowledgement or retry. A
// notification is worthless replayed later — "your figures were updated" three
// hours after the fact is worse than silence — and nothing is lost by dropping
// one, because every state it announces is also readable on the next request.
// It saves a client from waiting for that request, which is all it should be
// trusted to do.
func PublishAccountNotification(n *NATS, accountID, subtype string, body any) error {
	return PublishNotification(n, accountTenantPrefix+strings.TrimSpace(accountID), subtype, body)
}

// PublishNotification sends a notification to one tenant's clients.
func PublishNotification(n *NATS, tenantString, subtype string, body any) error {
	if n == nil || n.conn == nil {
		return fmt.Errorf("nats connection is required")
	}
	subject := NotificationSubject(tenantString, subtype)
	if subject == "" {
		return fmt.Errorf("notification needs a tenant and a subtype")
	}
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal %s notification: %w", subtype, err)
	}
	envelope, err := json.Marshal(Message{
		Type:    ClientMessageNotification,
		Subtype: subtype,
		Data:    data,
	})
	if err != nil {
		return fmt.Errorf("marshal notification envelope: %w", err)
	}
	if err := n.conn.Publish(subject, envelope); err != nil {
		return fmt.Errorf("publish %s: %w", subject, err)
	}
	return nil
}

// SubscribeNotifications calls handle for every notification, on every tenant.
//
// One wildcard subscription rather than one per hosted tenant: notifications are
// rare and small, delivery already decides who is connected, and a subscription
// that never changes cannot fall out of step with a tenant set that does.
func SubscribeNotifications(n *NATS, handle func(Notification)) (stop func(), err error) {
	if n == nil || n.conn == nil {
		return nil, fmt.Errorf("nats connection is required")
	}
	sub, serr := n.conn.Subscribe(NotificationFilter, func(msg *natslib.Msg) {
		tenant, subtype, ok := parseNotificationSubject(msg.Subject)
		if !ok {
			return
		}
		payload := make([]byte, len(msg.Data))
		copy(payload, msg.Data)
		handle(Notification{TenantString: tenant, Subtype: subtype, Payload: payload})
	})
	if serr != nil {
		return nil, fmt.Errorf("subscribe %s: %w", NotificationFilter, serr)
	}
	return func() { _ = sub.Unsubscribe() }, nil
}

// parseNotificationSubject splits notify.{tenantString}.{subtype}.
func parseNotificationSubject(subject string) (tenantString, subtype string, ok bool) {
	rest, found := strings.CutPrefix(subject, SubjectNotify+".")
	if !found {
		return "", "", false
	}
	tenantString, subtype, found = strings.Cut(rest, ".")
	if !found || tenantString == "" || subtype == "" {
		return "", "", false
	}
	return tenantString, subtype, true
}

// AccountIDFromTenantString returns the account a tenant string names, and
// whether it names one at all.
func AccountIDFromTenantString(tenantString string) (string, bool) {
	id, found := strings.CutPrefix(tenantString, accountTenantPrefix)
	id = strings.TrimSpace(id)
	if !found || id == "" {
		return "", false
	}
	return id, true
}
