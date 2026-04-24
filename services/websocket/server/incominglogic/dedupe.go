package incominglogic

type ParsedEnvelope struct {
	Valid    bool
	ClientID string
	Action   string
}

// DeduplicateSequential returns indexes to keep, preserving sequence groups.
// For each contiguous (clientID, action) group, it keeps the latest item.
func DeduplicateSequential(parsed []ParsedEnvelope) []int {
	if len(parsed) == 0 {
		return nil
	}

	var currentClientID string
	var currentAction string
	currentLastIdx := -1
	result := make([]int, 0, len(parsed))

	for i := range parsed {
		p := parsed[i]
		if !p.Valid {
			continue
		}

		if currentLastIdx >= 0 && p.ClientID == currentClientID && p.Action == currentAction {
			currentLastIdx = i
			continue
		}

		if currentLastIdx >= 0 {
			result = append(result, currentLastIdx)
		}
		currentClientID = p.ClientID
		currentAction = p.Action
		currentLastIdx = i
	}

	if currentLastIdx >= 0 {
		result = append(result, currentLastIdx)
	}

	return result
}
