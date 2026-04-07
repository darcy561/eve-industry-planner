package server

import (
	"encoding/json"
	"fmt"

	"eve-industry-planner/shared/logs"
)

// parseMessage detects if message is bulk operation and parses it
// Returns: (isBulk, operations array, error)
func (s *Server) parseMessage(msg []byte, clientID string) (bool, []Operation) {
	ctx := s.clientLogCtx(clientID)
	// Extract JSON part from message (format: "{docID} {jsonData}")
	// Try to parse without docID prefix first
	messageData := msg

	// Check if message starts with a docID prefix
	var docID string
	if _, err := fmt.Sscanf(string(msg), "%s", &docID); err == nil {
		// Message has docID prefix, extract JSON part
		docIDBytes := []byte(docID)
		if len(msg) > len(docIDBytes) && string(msg[:len(docIDBytes)]) == docID && msg[len(docIDBytes)] == ' ' {
			messageData = msg[len(docIDBytes)+1:]
		}
	}

	// Parse message as JSON
	var msgFormat struct {
		DocumentID interface{}            `json:"documentid"`
		Action     string                 `json:"action"`
		Data       map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(messageData, &msgFormat); err != nil {
		logs.DebugCtx(ctx, "failed to parse message as JSON, treating as single operation",
			"error", err)
		return false, nil
	}

	// Check if bulk operation
	if msgFormat.Action == "BULK" {
		operations, err := s.parseBulkOperations(msgFormat.Data, clientID)
		if err != nil {
			logs.WarnCtx(ctx, "failed to parse bulk operations",
				"error", err)
			return false, nil
		}
		return true, operations
	}

	// Single operation
	return false, nil
}

// parseBulkOperations extracts operations from bulk message format
func (s *Server) parseBulkOperations(data map[string]interface{}, clientID string) ([]Operation, error) {
	ctx := s.clientLogCtx(clientID)
	operationsData, ok := data["operations"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid bulk operations format")
	}

	var operations []Operation
	for i, opData := range operationsData {
		opMap, ok := opData.(map[string]interface{})
		if !ok {
			logs.WarnCtx(ctx, "invalid operation in bulk",
				"index", i)
			continue
		}

		// Extract document ID
		docID := s.extractDocumentIDFromMap(opMap, "documentid")
		if docID == "" {
			logs.WarnCtx(ctx, "missing documentid in bulk operation",
				"index", i)
			continue
		}

		// Extract action
		action, _ := opMap["action"].(string)
		if action == "" {
			action = "ADD" // Default action
		}

		// Extract data
		data, _ := opMap["data"].(map[string]interface{})
		if data == nil {
			data = make(map[string]interface{})
		}

		operations = append(operations, Operation{
			DocumentID: docID,
			Action:     action,
			Data:       data,
			ClientID:   clientID,
		})
	}

	return operations, nil
}

// extractDocumentIDFromMap extracts document ID from a map, handling string or number
func (s *Server) extractDocumentIDFromMap(m map[string]interface{}, key string) string {
	docIDVal, exists := m[key]
	if !exists {
		return ""
	}

	switch v := docIDVal.(type) {
	case string:
		return v
	case float64:
		return fmt.Sprintf("%.0f", v)
	case int:
		return fmt.Sprintf("%d", v)
	case int64:
		return fmt.Sprintf("%d", v)
	default:
		return ""
	}
}
