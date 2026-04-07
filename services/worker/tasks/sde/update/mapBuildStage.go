package update

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strconv"

	"eve-industry-planner/shared/logs"
)

type sdeMapBuildResult struct {
	StructuredData map[string]map[string]interface{}
}

// runSDEMapBuildStage handles stage 3: parse extracted JSONL and build keyed maps in memory.
func runSDEMapBuildStage(downloadResult *sdeDownloadResult) (*sdeMapBuildResult, error) {
	if downloadResult == nil || len(downloadResult.ExtractedFiles) == 0 {
		logs.DebugCtx(context.Background(), "SDE map-build stage skipped; no extracted files in memory")
		return &sdeMapBuildResult{StructuredData: map[string]map[string]interface{}{}}, nil
	}

	structuredData := make(map[string]map[string]interface{}, len(requiredFiles))
	for filename, fieldName := range requiredFiles {
		raw, ok := downloadResult.ExtractedFiles[filename]
		if !ok {
			return nil, fmt.Errorf("missing extracted file for map build: %s", filename)
		}

		mapped, err := parseJSONLToKeyedMap(raw)
		if err != nil {
			return nil, fmt.Errorf("failed parsing %s: %w", filename, err)
		}
		structuredData[fieldName] = mapped
	}

	counts := make(map[string]int, len(structuredData))
	for fieldName, entries := range structuredData {
		counts[fieldName] = len(entries)
	}
	logs.DebugCtx(context.Background(), "SDE map-build stage completed (in-memory)",
		"maps", len(structuredData),
		"entry_counts", counts,
	)

	return &sdeMapBuildResult{StructuredData: structuredData}, nil
}

func parseJSONLToKeyedMap(data []byte) (map[string]interface{}, error) {
	out := make(map[string]interface{})
	scanner := bufio.NewScanner(bytes.NewReader(data))
	// Raise token size to handle very large JSONL rows.
	scanner.Buffer(make([]byte, 0, 1024*1024), 64*1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}

		var obj map[string]interface{}
		if err := json.Unmarshal(line, &obj); err != nil {
			return nil, fmt.Errorf("invalid jsonl row: %w", err)
		}

		keyRaw, exists := obj["_key"]
		if !exists {
			continue
		}

		switch v := keyRaw.(type) {
		case string:
			out[v] = obj
		case float64:
			out[strconv.FormatFloat(v, 'f', -1, 64)] = obj
		default:
			out[fmt.Sprintf("%v", v)] = obj
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return out, nil
}
