import { useGetAllCharacterAssets } from "../../../Hooks/EveEsi/Character/useGetAllCharacterAssets";
import { useGetSingleCorporationAssets } from "../../../Hooks/EveEsi/useGetSingleCorporationAssets";
import AssetsDialogContent from "./diaglogContent";

export function CharacterAssetsDataProvider({ state, actions, children }) {
  const { isLoading: characterAssetsLoading, isError: characterAssetsError } =
    useGetAllCharacterAssets();
  return children({
    characterAssetsLoading,
    characterAssetsError,
  });
}

export function CorporationAssetsDataProvider({ state, actions, children }) {
  const {
    isLoading: corporationAssetsLoading,
    isError: corporationAssetsError,
  } = useGetSingleCorporationAssets(state.selectedCorporation);
  return children({
    corporationAssetsLoading,
    corporationAssetsError,
  });
}

export function AssetsDataProvider({ state, actions }) {
  if (state.useCorporationAssets) {
    return (
      <CorporationAssetsDataProvider state={state} actions={actions}>
        {({ corporationAssetsLoading, corporationAssetsError }) => (
          <AssetsDialogContent
            state={state}
            actions={actions}
            corporationAssetsLoading={corporationAssetsLoading}
            corporationAssetsError={corporationAssetsError}
          />
        )}
      </CorporationAssetsDataProvider>
    );
  }
  return (
    <CharacterAssetsDataProvider state={state} actions={actions}>
      {({ characterAssetsLoading, characterAssetsError }) => (
        <AssetsDialogContent
          state={state}
          actions={actions}
          characterAssetsLoading={characterAssetsLoading}
          characterAssetsError={characterAssetsError}
        />
      )}
    </CharacterAssetsDataProvider>
  );
}
