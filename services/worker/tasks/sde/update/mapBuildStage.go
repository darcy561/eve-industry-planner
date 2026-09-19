package update

import (
	"bufio"
	"bytes"
	"context"
	"eve-industry-planner/shared/jsoncodec"
	"fmt"
	"strconv"

	"eve-industry-planner/shared/logs"
)

type sdeMapBuildResult struct {
	StructuredData map[string]map[string]any
}

// runSDEMapBuildStage handles stage 3: parse extracted JSONL and build keyed maps in memory.
func runSDEMapBuildStage(downloadResult *sdeDownloadResult) (*sdeMapBuildResult, error) {
	if downloadResult == nil || (downloadResult.Archive == nil && len(downloadResult.ExtractedFiles) == 0) {
		logs.DebugCtx(context.Background(), "SDE map-build stage skipped; no downloaded data in memory")
		return &sdeMapBuildResult{StructuredData: map[string]map[string]any{}}, nil
	}

	structuredData := make(map[string]map[string]any, len(requiredFiles))
	for filename, fieldName := range requiredFiles {
		// One file's bytes are live at a time. types.jsonl alone is ~150MB
		// decompressed, so holding all eight at once sets the task's peak.
		raw, err := readFileForMapBuild(downloadResult, filename)
		if err != nil {
			return nil, err
		}

		mapped, err := parseJSONLToKeyedMap(raw, filename)
		if err != nil {
			return nil, fmt.Errorf("failed parsing %s: %w", filename, err)
		}
		structuredData[fieldName] = mapped

		// The parsed rows copy what they need, so the bytes are dead here.
		delete(downloadResult.ExtractedFiles, filename)
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

func parseJSONLToKeyedMap(data []byte, filename string) (map[string]any, error) {
	keep, filtered := keepFieldsFor(filename)
	_, localisedName := localisedNameFiles[filename]

	// Built once per file, not per row: the decoder it carries is the same for
	// every row and constructing it 53000 times would cost more than it saves.
	var decodeSelectively func([]byte, *jsoncodec.SelectiveObject) error
	if filtered {
		var transform func(string, any) any
		if localisedName {
			transform = func(name string, v any) any {
				if name != "name" {
					return v
				}
				return publishedLocaleOnly(v)
			}
		}
		decodeSelectively = jsoncodec.SelectMembers(keep, transform)
	}

	out := make(map[string]any)
	scanner := bufio.NewScanner(bytes.NewReader(data))
	// Raise token size to handle very large JSONL rows.
	scanner.Buffer(make([]byte, 0, 1024*1024), 64*1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}

		var obj map[string]any
		if decodeSelectively != nil {
			// Unread members are skipped in the reader rather than decoded and
			// dropped, so their bytes never become Go values. That is the whole
			// point: the peak is set while decoding, not after.
			var selected jsoncodec.SelectiveObject
			if err := decodeSelectively(line, &selected); err != nil {
				return nil, fmt.Errorf("invalid jsonl row: %w", err)
			}
			obj = selected
		} else if err := jsoncodec.Unmarshal(line, &obj); err != nil {
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

// readFileForMapBuild returns one required file's JSONL bytes, decompressing it
// from the archive when the download stage handed one over.
func readFileForMapBuild(downloadResult *sdeDownloadResult, filename string) ([]byte, error) {
	if raw, ok := downloadResult.ExtractedFiles[filename]; ok {
		return raw, nil
	}
	if downloadResult.Archive != nil {
		return openArchiveEntry(downloadResult.Archive, filename)
	}
	return nil, fmt.Errorf("missing extracted file for map build: %s", filename)
}
