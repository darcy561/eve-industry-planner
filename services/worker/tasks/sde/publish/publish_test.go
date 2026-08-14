package publish

import (
	"context"
	"testing"

	objectstore "eve-industry-planner/shared/core/objectstore"
	sdecore "eve-industry-planner/shared/core/sde"
)

func TestPublishLive_S3_firstThenArchive(t *testing.T) {
	b := objectstore.OpenTestStore(t)
	ctx := context.Background()

	files := map[string][]byte{
		"output/" + sdecore.RecipeListFile:         []byte(`[{"itemID":1}]`),
		"output/" + sdecore.SearchIndexFile:        []byte(`{}`),
		"output/" + sdecore.FullItemListFile:       []byte(`[]`),
		"output/" + sdecore.ReprocessingFile:       []byte(`{}`),
		"output/" + sdecore.InventionModifiersFile: []byte(`{}`),
	}

	pub, err := PublishLive(ctx, b, files, sdecore.VersionJSON{BuildNumber: 99}, false, "https://example.test")
	if err != nil {
		t.Fatalf("first publish: %v", err)
	}
	if pub == nil || pub.HasPreviousVersion {
		t.Fatalf("expected first publish without previous, got %#v", pub)
	}
	v, err := sdecore.ReadRootVersionJSON(ctx, b)
	if err != nil || v == nil || v.Version != "99_v1" {
		t.Fatalf("expected live version 99_v1, got %#v err=%v", v, err)
	}

	files["output/"+sdecore.RecipeListFile] = []byte(`[{"itemID":2}]`)
	pub2, err := PublishLive(ctx, b, files, sdecore.VersionJSON{BuildNumber: 99}, false, "https://example.test")
	if err != nil {
		t.Fatalf("second publish: %v", err)
	}
	if pub2 == nil || !pub2.HasPreviousVersion || pub2.ArchiveVersionName != "99_v1" {
		t.Fatalf("expected archive 99_v1, got %#v", pub2)
	}
	v2, err := sdecore.ReadRootVersionJSON(ctx, b)
	if err != nil || v2 == nil || v2.Version != "99_v2" {
		t.Fatalf("expected live version 99_v2, got %#v err=%v", v2, err)
	}
	if _, err := b.Stat(ctx, sdecore.PreviousVersionKey("99_v1", sdecore.RecipeListFile)); err != nil {
		t.Fatalf("archive recipe missing: %v", err)
	}
	if b.Kind() != "s3" {
		t.Fatalf("expected s3 backend, got %s", b.Kind())
	}
}
