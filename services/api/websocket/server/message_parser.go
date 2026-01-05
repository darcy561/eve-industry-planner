package server

import (
	"encoding/json"
	"fmt"

	"eve-industry-planner/shared/shared/logs"
)

// MessageFormat represents the new message structure
type MessageFormat struct {
	DocumentID interface{}            `json:"documentid"` // Can be string or number
	Action     string                 `json:"action"`     // ADD, UPDATE, DELETE
	Data       map[string]interface{} `json:"data"`
}

// parsedMessage holds an Event with its parsed data
// Used to avoid parsing messages multiple times
type parsedMessage struct {
	event     Event
	clientID  string
	action    string
	valid     bool           // true if parsing succeeded
	msgFormat *MessageFormat // Full parsed message data (nil if parsing failed)
}

// parseEventFull parses the full Event and returns all parsed data
// This avoids parsing JSON multiple times - parses once upfront
// Returns: (clientID, action, msgFormat, error)
// Returns error if action is missing or empty (incomplete message)
func (s *Server) parseEventFull(event Event) (string, string, *MessageFormat, error) {
	// Extract JSON part from message (format: "{docID} {jsonData}")
	messageData := event.Msg

	// If message starts with docID followed by space, extract JSON part
	docIDBytes := []byte(event.DocID)
	if len(messageData) > len(docIDBytes) && string(messageData[:len(docIDBytes)]) == event.DocID && messageData[len(docIDBytes)] == ' ' {
		messageData = messageData[len(docIDBytes)+1:]
	}

	// Parse message as JSON
	var msgFormat MessageFormat
	if err := json.Unmarshal(messageData, &msgFormat); err != nil {
		return "", "", nil, fmt.Errorf("failed to parse message: %w", err)
	}

	// Extract action - must be present and non-empty
	action := msgFormat.Action
	if action == "" {
		return "", "", nil, fmt.Errorf("action field missing or empty")
	}

	// Return clientID, action, and full parsed message format
	return event.ClientID, action, &msgFormat, nil
}

// parseEventAction extracts (clientID, action) from an Event
// This is a convenience wrapper around parseEventFull for cases where full data isn't needed
// Returns: (clientID, action, error)
// Returns error if action is missing or empty (incomplete message)
func (s *Server) parseEventAction(event Event) (string, string, error) {
	clientID, action, _, err := s.parseEventFull(event)
	return clientID, action, err
}

// parseAllMessages parses all messages once and returns parsed results
// This avoids parsing JSON multiple times - parses full message data upfront
func (s *Server) parseAllMessages(messages []Event) []parsedMessage {
	parsed := make([]parsedMessage, 0, len(messages))

	for i := range messages {
		clientID, action, msgFormat, err := s.parseEventFull(messages[i])
		if err != nil {
			// Invalid message - mark as invalid but keep it
			logs.Debug("skipping invalid message",
				"doc_id", messages[i].DocID,
				"error", err)
			parsed = append(parsed, parsedMessage{
				event:     messages[i],
				clientID:  "",
				action:    "",
				valid:     false,
				msgFormat: nil,
			})
			continue
		}

		parsed = append(parsed, parsedMessage{
			event:     messages[i],
			clientID:  clientID,
			action:    action,
			valid:     true,
			msgFormat: msgFormat,
		})
	}

	return parsed
}
