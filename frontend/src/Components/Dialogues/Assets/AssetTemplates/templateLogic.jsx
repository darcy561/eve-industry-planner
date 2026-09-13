import AssetTemplate_AssetDialogueWindow from "./assetTemplate";
import AssetContainerTemplate_AssetDialogueWindow from "./containerTemplate";

export default function AssetLocationLogic_AssetDialogueWindow({
  branch,
  containerNames,
  compartmentNames,
  showOwner,
}) {
  if (!branch) return null;

  const shared = {
    branch,
    containerNames,
    compartmentNames,
    showOwner,
  };

  return branch.children.length > 0 ? (
    <AssetContainerTemplate_AssetDialogueWindow {...shared} />
  ) : (
    <AssetTemplate_AssetDialogueWindow {...shared} />
  );
}
