package update

import (
	"archive/zip"
	"bytes"
	"context"
	"testing"

	"eve-industry-planner/worker/taskrun"
)

// The map-build stage parses each extracted file into its own keyed map, which
// copies what it keeps. Holding the raw bytes past that point kept every
// decompressed file live for the length of the stage.
func TestRunSDEMapBuildStage_releasesExtractedBytes(t *testing.T) {
	extracted := make(map[string][]byte, len(requiredFiles))
	for filename := range requiredFiles {
		extracted[filename] = []byte("{\"_key\":\"1\",\"value\":1}\n")
	}
	downloadResult := &sdeDownloadResult{ExtractedFiles: extracted}

	if _, err := runSDEMapBuildStage(downloadResult); err != nil {
		t.Fatalf("map build stage: %v", err)
	}

	if len(downloadResult.ExtractedFiles) != 0 {
		t.Fatalf("extracted files still held after parsing: %d remain", len(downloadResult.ExtractedFiles))
	}
}

// The blueprints sync reads the conversion output, so it has to finish inside
// the pipeline. Detaching it held every converted file alive past the handler.
func TestRunSDEUpdatePipeline_blueprintsSyncCompletesBeforePersist(t *testing.T) {
	var calls []string

	withStageMocks(t, map[string]any{
		"stageDownload": func(_ context.Context, _ *sdeVersionCheckResult) (*sdeDownloadResult, error) {
			return &sdeDownloadResult{ExtractedFiles: map[string][]byte{}}, nil
		},
		"stageMapBuild": func(_ *sdeDownloadResult) (*sdeMapBuildResult, error) {
			return &sdeMapBuildResult{StructuredData: map[string]map[string]any{}}, nil
		},
		"stageConversion": func(_ *sdeMapBuildResult) (*sdeConversionResult, error) {
			return &sdeConversionResult{Files: map[string][]byte{}}, nil
		},
		"stageBlueprintsSync": func(_ context.Context, _ *sdeConversionResult, _ *taskrun.Dependencies) error {
			calls = append(calls, "blueprintsSync")
			return nil
		},
		"stagePersistReplace": func(_ *sdeVersionCheckResult, _ *sdeConversionResult) (*sdePersistResult, error) {
			calls = append(calls, "persistReplace")
			return &sdePersistResult{}, nil
		},
	})

	err := runSDEUpdatePipelineReplacingCurrent(context.Background(), &taskrun.Dependencies{}, &sdeVersionCheckResult{NeedsUpdate: true})
	if err != nil {
		t.Fatalf("pipeline: %v", err)
	}

	if len(calls) != 2 || calls[0] != "blueprintsSync" || calls[1] != "persistReplace" {
		t.Fatalf("blueprints sync did not complete before persist: %v", calls)
	}
}

// A failing blueprints write must fail the task rather than being swallowed by a
// goroutine nothing waits on.
func TestRunSDEUpdatePipeline_blueprintsSyncErrorFailsTask(t *testing.T) {
	withStageMocks(t, map[string]any{
		"stageDownload": func(_ context.Context, _ *sdeVersionCheckResult) (*sdeDownloadResult, error) {
			return &sdeDownloadResult{ExtractedFiles: map[string][]byte{}}, nil
		},
		"stageMapBuild": func(_ *sdeDownloadResult) (*sdeMapBuildResult, error) {
			return &sdeMapBuildResult{StructuredData: map[string]map[string]any{}}, nil
		},
		"stageConversion": func(_ *sdeMapBuildResult) (*sdeConversionResult, error) {
			return &sdeConversionResult{Files: map[string][]byte{}}, nil
		},
		"stageBlueprintsSync": func(_ context.Context, _ *sdeConversionResult, _ *taskrun.Dependencies) error {
			return context.DeadlineExceeded
		},
		"stagePersistReplace": func(_ *sdeVersionCheckResult, _ *sdeConversionResult) (*sdePersistResult, error) {
			t.Fatal("persist ran after the blueprints sync failed")
			return nil, nil
		},
	})

	err := runSDEUpdatePipelineReplacingCurrent(context.Background(), &taskrun.Dependencies{}, &sdeVersionCheckResult{NeedsUpdate: true})
	if err == nil {
		t.Fatal("pipeline reported success after the blueprints sync failed")
	}
}

// buildTestArchive returns a zip holding every required file, each one row.
func buildTestArchive(t *testing.T) *zip.Reader {
	t.Helper()

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for filename := range requiredFiles {
		w, err := zw.Create("sde/" + filename)
		if err != nil {
			t.Fatalf("create %s: %v", filename, err)
		}
		if _, err := w.Write([]byte("{\"_key\":\"1\",\"value\":1}\n")); err != nil {
			t.Fatalf("write %s: %v", filename, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}

	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatalf("open zip: %v", err)
	}
	return zr
}

// The map build decompresses each entry as it reaches it, so an archive alone is
// enough input; nothing needs to be extracted ahead of the stage.
func TestRunSDEMapBuildStage_readsFromArchive(t *testing.T) {
	downloadResult := &sdeDownloadResult{Archive: buildTestArchive(t)}

	result, err := runSDEMapBuildStage(downloadResult)
	if err != nil {
		t.Fatalf("map build stage: %v", err)
	}

	if len(result.StructuredData) != len(requiredFiles) {
		t.Fatalf("expected %d maps from the archive, got %d", len(requiredFiles), len(result.StructuredData))
	}
	for _, fieldName := range requiredFiles {
		if len(result.StructuredData[fieldName]) == 0 {
			t.Fatalf("%s was not parsed from the archive", fieldName)
		}
	}
}

// The download stage hands over the compressed archive. Decompressing the
// entries there put ~190MB live before the map build had parsed a single row.
func TestSDEDownloadResult_carriesArchiveNotExtractedBytes(t *testing.T) {
	archive := buildTestArchive(t)
	downloadResult := &sdeDownloadResult{Archive: archive}

	if len(downloadResult.ExtractedFiles) != 0 {
		t.Fatalf("download stage extracted %d file(s) up front", len(downloadResult.ExtractedFiles))
	}

	raw, err := readFileForMapBuild(downloadResult, "types.jsonl")
	if err != nil {
		t.Fatalf("read types.jsonl from archive: %v", err)
	}
	if len(raw) == 0 {
		t.Fatal("types.jsonl came back empty from the archive")
	}
}

// A required file absent from the archive must fail rather than yield an empty map.
func TestReadFileForMapBuild_missingEntryFails(t *testing.T) {
	downloadResult := &sdeDownloadResult{Archive: buildTestArchive(t)}

	if _, err := readFileForMapBuild(downloadResult, "notARealFile.jsonl"); err == nil {
		t.Fatal("a missing archive entry reported success")
	}
}
