import AssetTemplate_AssetDialogWindow from "./assetTemplate";
import AssetContainerTemplate_AssetDialogWindow from "./containerTemplate";

export default function AssetLocationLogic_AssetDialogWindow(props) {
  const { state, assetObject } = props;
  if (!assetObject) return null;

  const matchedAssets = state.assetLocations.get(assetObject.item_id);

  if (matchedAssets) {
    return (
      <AssetContainerTemplate_AssetDialogWindow
        {...props}
        matchedAssets={matchedAssets}
      />
    );
  } else {
    return <AssetTemplate_AssetDialogWindow
      {...props}
    />;
  }
}
