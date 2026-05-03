package update

import (
	"context"
	"encoding/json"
	"fmt"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/worker/tasks/sde/update/conversion"
)

type sdeConversionResult struct {
	Files      map[string][]byte
	RecipeList []*conversion.EVEType
}

func runSDEConversionStage(mapResult *sdeMapBuildResult) (*sdeConversionResult, error) {
	if mapResult == nil || len(mapResult.StructuredData) == 0 {
		logs.DebugCtx(context.Background(), "SDE conversion stage skipped; no structured data")
		return &sdeConversionResult{Files: map[string][]byte{}}, nil
	}

	blueprintsData := mapResult.StructuredData["Blueprints"]
	typesData := mapResult.StructuredData["Types"]
	typeMaterialsData := mapResult.StructuredData["TypeMaterials"]
	marketGroupsData := mapResult.StructuredData["MarketGroups"]
	dogmaAttributesData := mapResult.StructuredData["DogmaAttributes"]
	typeDogmaData := mapResult.StructuredData["TypeDogma"]
	if blueprintsData == nil || typesData == nil || typeMaterialsData == nil || marketGroupsData == nil ||
		dogmaAttributesData == nil || typeDogmaData == nil {
		return nil, fmt.Errorf("missing one or more required structured data maps")
	}

	blueprintTypeIDMap := conversion.ConvertBlueprintDataToTypeIDMap(blueprintsData)
	combinedItemMap := conversion.BuildCombinedItemMap(typesData, blueprintTypeIDMap)
	conversion.ApplyInventionToOutputItems(blueprintsData, combinedItemMap)
	conversion.MergeInventionOntManufacturedProduct(combinedItemMap, conversion.BuildManufacturedProductByBlueprintTypeID(blueprintsData))
	recipeList := conversion.GenerateRecipeListOutput(combinedItemMap)
	searchIndex := conversion.GenerateSearchIndexOutput(recipeList)
	fullItemList := conversion.GenerateFullItemListOutput(combinedItemMap, marketGroupsData)
	reprocessingObjects := conversion.GenerateReprocessingDataOutput(typeMaterialsData, combinedItemMap, marketGroupsData)
	inventionModifiers, err := conversion.GenerateInventionModifiersOutput(typesData, dogmaAttributesData, typeDogmaData)
	if err != nil {
		return nil, err
	}

	files := make(map[string][]byte)
	if err := addJSONFile(files, "output/searchIndex", searchIndex); err != nil {
		return nil, err
	}
	if err := addJSONFile(files, "output/fullItemList", fullItemList); err != nil {
		return nil, err
	}
	if err := addJSONFile(files, "output/recipeList", recipeList); err != nil {
		return nil, err
	}
	if err := addJSONFile(files, "output/reprocessingData", reprocessingObjects); err != nil {
		return nil, err
	}
	if err := addJSONFile(files, "output/inventionModifiers", inventionModifiers); err != nil {
		return nil, err
	}

	logs.DebugCtx(context.Background(), "SDE conversion stage completed (in-memory files ready)",
		"files_generated", len(files),
		"blueprints", len(recipeList),
		"search_items", len(searchIndex),
		"full_item_list", len(fullItemList),
		"reprocessing_items", len(reprocessingObjects),
		"invention_modifier_items", len(inventionModifiers.Items),
	)
	return &sdeConversionResult{
		Files:      files,
		RecipeList: recipeList,
	}, nil
}

func addJSONFile(out map[string][]byte, basePath string, v interface{}) error {
	jsonData, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal %s failed: %w", basePath, err)
	}
	out[basePath+".json"] = jsonData
	return nil
}
