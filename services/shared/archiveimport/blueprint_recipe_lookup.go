package archiveimport

import (
	_ "embed"
	"encoding/json"
	"strconv"
)

// product_blueprint_typeid.json is a compact { "itemID": blueprintTypeID } map derived from the
// worker SDE artifact live_data/recipeList.json (e.g. services/worker/tmp/sde/live_data/recipeList.json).
// Regenerate, then replace data/product_blueprint_typeid.json:
//
//	python3 -c 'import json; r=json.load(open("services/worker/tmp/sde/live_data/recipeList.json")); m={str(x["itemID"]):int(x["blueprintTypeID"]) for x in r if x.get("blueprintTypeID") is not None}; json.dump(m, open("services/shared/archiveimport/data/product_blueprint_typeid.json","w"), separators=(",",":"))'
//	python3 -c 'import json; r=json.load(open("services/worker/tmp/sde/live_data/recipeList.json")); m={str(x["itemID"]):int(x["metaGroupID"]) for x in r if "metaGroupID" in x}; json.dump(m, open("services/shared/archiveimport/data/product_meta_groupid.json","w"), separators=(",",":"))'
//
//go:embed data/product_blueprint_typeid.json
var productBlueprintTypeIDJSON []byte

//go:embed data/product_meta_groupid.json
var productMetaGroupIDJSON []byte

var recipeListProductToBlueprint map[int]int
var recipeListProductToMetaGroupID map[int]int

func init() {
	var raw map[string]int
	if err := json.Unmarshal(productBlueprintTypeIDJSON, &raw); err != nil {
		panic("archiveimport: parse embed data/product_blueprint_typeid.json: " + err.Error())
	}
	recipeListProductToBlueprint = make(map[int]int, len(raw))
	for k, v := range raw {
		id, err := strconv.Atoi(k)
		if err != nil {
			continue
		}
		recipeListProductToBlueprint[id] = v
	}

	var rawMG map[string]int
	if err := json.Unmarshal(productMetaGroupIDJSON, &rawMG); err != nil {
		panic("archiveimport: parse embed data/product_meta_groupid.json: " + err.Error())
	}
	recipeListProductToMetaGroupID = make(map[int]int, len(rawMG))
	for k, v := range rawMG {
		id, err := strconv.Atoi(k)
		if err != nil {
			continue
		}
		recipeListProductToMetaGroupID[id] = v
	}
}

// fillBlueprintTypeIDFromRecipeList sets root blueprintTypeID from embedded recipeList mapping when
// still missing after linked-job inference (product itemID → blueprint type from static data).
func fillBlueprintTypeIDFromRecipeList(m map[string]any) {
	if intFromAny(m["blueprintTypeID"]) != 0 {
		return
	}
	itemID := intFromAny(m["itemID"])
	if itemID == 0 {
		return
	}
	bp, ok := recipeListProductToBlueprint[itemID]
	if !ok {
		return
	}
	m["blueprintTypeID"] = bp
}

// fillMetaLevelFromRecipeList sets metaLevel from recipeList metaGroupID when missing or zero
// (matches SDE item meta tier; legacy Firestore may omit metaLevel while still having metaGroup via normalizeMetaLevel).
func fillMetaLevelFromRecipeList(m map[string]any) {
	if metaLevelLooksSet(m["metaLevel"]) {
		return
	}
	itemID := intFromAny(m["itemID"])
	if itemID == 0 {
		return
	}
	mg, ok := recipeListProductToMetaGroupID[itemID]
	if !ok {
		return
	}
	m["metaLevel"] = mg
}

func metaLevelLooksSet(v any) bool {
	if v == nil {
		return false
	}
	return intFromAny(v) != 0
}
