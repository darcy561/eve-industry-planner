package conversion

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func TestFullSDEConversion_matchesPublishedSDEReference(t *testing.T) {
	blueprints, types := loadSDEExtractOrSkip(t)

	referenceByProduct := ConvertBlueprintDataToTypeIDMap(blueprints, types)

	combined := BuildCombinedItemMap(types, referenceByProduct)
	ApplyInventionToOutputItems(blueprints, combined, types)
	MergeInventionOntManufacturedProduct(combined, BuildManufacturedProductByBlueprintTypeID(blueprints, types))
	MergeReactionFormulaOntoProduct(combined, BuildReactionProductByBlueprintTypeID(blueprints, types), types)
	recipeList := GenerateRecipeListOutput(combined)

	collision, reaction, mfg := discoverAnchorProducts(blueprints, types)
	t.Logf("anchors: collision_product=%d reaction_product=%d manufacturing_product=%d", collision, reaction, mfg)

	mfgCount, reactionCount := 0, 0
	for _, got := range recipeList {
		switch got.JobType {
		case ManufacturingID:
			mfgCount++
		case ReactionID:
			reactionCount++
		}

		key := strconv.Itoa(got.ItemID)
		ref, ok := referenceByProduct[key].(map[string]interface{})
		if !ok || !isProductIndexKey(key, ref) {
			continue
		}
		if err := recipeMatchesReferenceBlueprint(got, ref); err != nil {
			t.Errorf("itemID %d (%s): %v", got.ItemID, got.Name, err)
		}
	}

	for key, raw := range referenceByProduct {
		if !isProductIndexKey(key, raw.(map[string]interface{})) {
			continue
		}
		bp := raw.(map[string]interface{})
		if !isPublishedBlueprintFormula(bp, types) {
			t.Errorf("reference map product %s uses unpublished formula type %s", key, blueprintTypeIDKey(bp))
		}
	}

	if collision > 0 {
		assertProductRecipeMatchesReference(t, recipeList, referenceByProduct, collision)
	}
	if reaction > 0 {
		assertProductRecipeMatchesReference(t, recipeList, referenceByProduct, reaction)
	}
	if mfg > 0 {
		assertProductRecipeMatchesReference(t, recipeList, referenceByProduct, mfg)
	}

	t.Logf("recipe list: total=%d manufacturing=%d reactions=%d", len(recipeList), mfgCount, reactionCount)
	if reactionCount == 0 || mfgCount == 0 {
		t.Fatal("expected both manufacturing and reaction recipes in output")
	}
}

func assertProductRecipeMatchesReference(t *testing.T, recipeList []*EVEType, referenceByProduct map[string]interface{}, itemID int) {
	t.Helper()
	key := strconv.Itoa(itemID)
	ref, ok := referenceByProduct[key].(map[string]interface{})
	if !ok {
		t.Fatalf("itemID %d: missing from reference map", itemID)
	}
	var got *EVEType
	for _, r := range recipeList {
		if r.ItemID == itemID {
			got = r
			break
		}
	}
	if got == nil {
		t.Fatalf("itemID %d: missing from recipe list", itemID)
	}
	if err := recipeMatchesReferenceBlueprint(got, ref); err != nil {
		t.Fatalf("itemID %d: %v", itemID, err)
	}
}

func recipeMatchesReferenceBlueprint(got *EVEType, ref map[string]interface{}) error {
	wantJob := jobTypeForBlueprintRow(ref)
	if got.JobType != wantJob {
		return mismatch("jobType", got.JobType, wantJob)
	}
	wantBPID, ok := parseSDETypeID(ref["blueprintTypeID"])
	if !ok {
		return mismatch("blueprintTypeID", got.BlueprintTypeID, "missing in reference")
	}
	if got.BlueprintTypeID != wantBPID {
		return mismatch("blueprintTypeID", got.BlueprintTypeID, wantBPID)
	}
	wantQty, wantOK := blueprintProductQuantity(ref, wantJob)
	gotQty, gotOK := activityProductQuantity(got)
	if wantOK != gotOK || (wantOK && wantQty != gotQty) {
		return mismatch("product quantity", gotQty, wantQty)
	}
	return nil
}

type mismatchErr struct {
	field string
	got   any
	want  any
}

func mismatch(field string, got, want any) error {
	return mismatchErr{field: field, got: got, want: want}
}

func (e mismatchErr) Error() string {
	return e.field + ": got " + formatAny(e.got) + " want " + formatAny(e.want)
}

func formatAny(v any) string {
	switch x := v.(type) {
	case string:
		return x
	default:
		return strconv.FormatInt(int64(intFromAny(v)), 10)
	}
}

func intFromAny(v any) int {
	n, _ := parseSDETypeID(v)
	return n
}

func loadSDEExtractOrSkip(t *testing.T) (blueprints, types map[string]interface{}) {
	t.Helper()
	extractDir := os.Getenv("SDE_EXTRACT_DIR")
	if extractDir == "" {
		extractDir = "/tmp/sde_extract"
	}
	if _, err := os.Stat(filepath.Join(extractDir, "blueprints.jsonl")); err != nil {
		t.Skipf("SDE extract not found at %s (set SDE_EXTRACT_DIR or unzip SDE to /tmp/sde_extract)", extractDir)
	}
	var err error
	blueprints, err = parseJSONLFile(filepath.Join(extractDir, "blueprints.jsonl"))
	if err != nil {
		t.Fatalf("blueprints: %v", err)
	}
	types, err = parseJSONLFile(filepath.Join(extractDir, "types.jsonl"))
	if err != nil {
		t.Fatalf("types: %v", err)
	}
	return blueprints, types
}

func parseJSONLFile(path string) (map[string]interface{}, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	out := make(map[string]interface{})
	scanner := bufio.NewScanner(bytes.NewReader(data))
	scanner.Buffer(make([]byte, 0, 1024*1024), 64*1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}
		var obj map[string]interface{}
		if err := json.Unmarshal(line, &obj); err != nil {
			return nil, err
		}
		keyRaw, exists := obj["_key"]
		if !exists {
			continue
		}
		switch v := keyRaw.(type) {
		case float64:
			out[strconv.FormatFloat(v, 'f', -1, 64)] = obj
		case string:
			out[v] = obj
		}
	}
	return out, scanner.Err()
}
