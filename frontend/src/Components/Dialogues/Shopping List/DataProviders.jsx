import { useGetAllCharacterAssets } from "../../../Hooks/EveEsi/Character/useGetAllCharacterAssets";
import { useGetSingleCorporationAssets } from "../../../Hooks/EveEsi/useGetSingleCorporationAssets";
import { ShoppingListDialogContent } from "./ShoppingListDialogContent";

// Main content component that always renders the same structure
// Hooks are always called (React rules) but queries are conditionally enabled
export function ShoppingListContent({ state, actions }) {
  // Always call hooks unconditionally, but conditionally enable the queries
  const allCharacterAssetsResult = useGetAllCharacterAssets(state.assetType === "character");
  const corporationAssetsResult = useGetSingleCorporationAssets(
    state.selectedCorporation,
    state.assetType === "corporation"
  );

  // Extract loading and error states
  const allCharacterAssetsLoading = state.assetType === "character"
    ? allCharacterAssetsResult.isLoading 
    : undefined;
  const allCharacterAssetsError = state.assetType === "character"
    ? allCharacterAssetsResult.isError 
    : undefined;

  const corporationAssetsLoading = state.assetType === "corporation"
    ? corporationAssetsResult.isLoading 
    : undefined;
  const corporationAssetsError = state.assetType === "corporation"
    ? corporationAssetsResult.isError 
    : undefined;

  // Always render the same component structure to prevent remounting
  return (
    <ShoppingListDialogContent 
      state={state} 
      actions={actions} 
      allCharacterAssetsLoading={allCharacterAssetsLoading}
      allCharacterAssetsError={allCharacterAssetsError}
      corporationAssetsLoading={corporationAssetsLoading}
      corporationAssetsError={corporationAssetsError}
    />
  );
}
