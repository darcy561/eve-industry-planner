package writers

import (
	"context"
	"testing"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestCreateGroupTemplate_requiresArgs(t *testing.T) {
	t.Parallel()
	err := CreateGroupTemplate(context.Background(), nil, "acct", models.TemplateCatalogEntry{}, bson.M{})
	if err == nil {
		t.Fatal("expected error for nil mongo")
	}
}

func TestReplaceGroupTemplatePayload_requiresArgs(t *testing.T) {
	t.Parallel()
	err := ReplaceGroupTemplatePayload(context.Background(), nil, "acct", "tpl", models.TemplateCatalogEntry{}, bson.M{})
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestDeleteGroupTemplate_requiresArgs(t *testing.T) {
	t.Parallel()
	_, err := DeleteGroupTemplate(context.Background(), nil, "acct", "tpl")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestApplyProductionTotalsArchiveBatch_emptyAndNil(t *testing.T) {
	t.Parallel()
	if err := ApplyProductionTotalsArchiveBatch(context.Background(), nil, "op", nil); err != nil {
		t.Fatalf("empty pairs should no-op: %v", err)
	}
	if err := ApplyProductionTotalsArchiveBatch(context.Background(), nil, "op", []ProductionTotalsArchivePair{}); err != nil {
		t.Fatalf("empty pairs should no-op: %v", err)
	}
	pairs := []ProductionTotalsArchivePair{{
		StatsFilter: bson.M{"_id": "x"},
		StatsUpdate: bson.M{"$set": bson.M{"a": 1}},
		JobFilter:   bson.M{"_id": "j"},
		JobUpdate:   bson.M{"$set": bson.M{"b": true}},
	}}
	if err := ApplyProductionTotalsArchiveBatch(context.Background(), nil, "op", pairs); err == nil {
		t.Fatal("expected error for nil mongo with non-empty pairs")
	}
}

func TestRunOrdered_nilBulk(t *testing.T) {
	t.Parallel()
	if _, err := RunOrdered(context.Background(), "op", nil); err == nil {
		t.Fatal("expected error for nil bulk")
	}
}
