import AssetTemplate_AssetDialogueWindow from "./assetTemplate";
import AssetContainerTemplate_AssetDialogueWindow from "./containerTemplate";

export default function AssetLocationLogic_AssetDialogueWindow(props) {
  const { state, assetObject } = props;
  if (!assetObject) return null;

  const matchedAssets = state.assetLocations.get(assetObject.item_id);

  if (matchedAssets) {
    return (
      <AssetContainerTemplate_AssetDialogueWindow
        {...props}
        matchedAssets={matchedAssets}
      />
    );
  } else {
    return <AssetTemplate_AssetDialogueWindow
      {...props}
    />;
  }
}
