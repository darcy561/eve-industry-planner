import { AssetEntry_Child } from "./childItem";
import { AssetEntry_Parent } from "./parentFolder";

export function AssetEntry_Selector({
  assetObject,
  assetLocations,
  topLevelAssets,
  assetLocationNames,
  characterBlueprintsMap,
  depth,
  index,
  fullItemList
}) {
  if (!assetObject) return null;
  const matchedAssets = assetLocations.get(assetObject.item_id);
  if (matchedAssets) {
    return (
      <AssetEntry_Parent
        assetObject={assetObject}
        matchedAssets={matchedAssets}
        assetLocations={assetLocations}
        topLevelAssets={topLevelAssets}
        assetLocationNames={assetLocationNames}
        characterBlueprintsMap={characterBlueprintsMap}
        depth={depth}
        index={index}
        fullItemList={fullItemList}
      /> 
    );
  } else {
    return (
      <AssetEntry_Child
        assetObject={assetObject}
        assetLocations={assetLocations}
        topLevelAssets={topLevelAssets}
        assetLocationNames={assetLocationNames}
        characterBlueprintsMap={characterBlueprintsMap}
        depth={depth}
        index={index}
        fullItemList={fullItemList}
      />
    );
  }
}
