import { useEffect, useMemo } from "react";
import AssetTree from "./Tree/assetTree";
import PanelFallBack from "../../Styled Components/Paper/panelStates";
import useUsersStore from "../../Zustand/usersStore";
import useAssetTree from "../../Hooks/EveEsi/useAssetTree";
import useExpandedRows from "../../Hooks/useExpandedRows";
import { ASSET_SCOPE } from "../../Hooks/EveEsi/useAssetIndex";
import { BLUEPRINT_SCOPE } from "../../Hooks/EveEsi/useBlueprintIndex";
import { officeLocationIds } from "../../Functions/Assets/assetTree";
import { ASSET_OWNER } from "./assetScopePicker";

/**
 * The views an owner's assets can be shown in.
 *
 * A corporation files what it holds in hangar divisions inside an office, so its first view is the
 * offices rather than a flat list; the other two are the same compartments under another name.
 *
 * @type {Readonly<Record<string, Array<{value: string, label: string}>>>}
 */
export const ASSET_VIEWS = Object.freeze({
  [ASSET_OWNER.CHARACTER]: [
    { value: "held", label: "Assets" },
    { value: "deliveries", label: "Deliveries" },
    { value: "assetSafety", label: "Asset Safety" },
  ],
  [ASSET_OWNER.CORPORATION]: [
    { value: "held", label: "Offices" },
    { value: "deliveries", label: "Deliveries" },
    { value: "assetSafety", label: "Asset Safety" },
  ],
});

const CHARACTER_OTHER_VIEWS = ["Deliveries", "AssetSafety"];
const CHARACTER_DELIVERIES = ["Deliveries"];
const CORPORATION_DELIVERIES = ["CorpDeliveries"];
const ASSET_SAFETY = ["AssetSafety"];

/**
 * One owner's assets in one view.
 *
 * @param {{kind: string, id: string|number, view: string, search?: string, hideAssembledShips?: boolean}} props
 */
export default function AssetLibraryView({
  kind,
  id,
  view,
  search,
  hideAssembledShips,
}) {
  const isCorporation = kind === ASSET_OWNER.CORPORATION;
  const { expanded, toggle } = useExpandedRows();

  const character = useUsersStore((state) =>
    isCorporation
      ? state.account.characters.find(
          (c) => Number(c.corporation_id) === Number(id),
        )
      : state.account.characters.find((c) => c.CharacterHash === id),
  );
  const corporation = useUsersStore((state) =>
    state.account.corporations.find(
      (c) => Number(c.corporation_id) === Number(id),
    ),
  );

  const hangars = corporation?.hangars;
  const hangarFlags = useMemo(
    () => (hangars ?? []).map(({ assetLocationRef }) => assetLocationRef),
    [hangars],
  );

  const narrow = useMemo(() => {
    if (view === "assetSafety") return { rootFlags: ASSET_SAFETY };
    if (view === "deliveries") {
      return {
        rootFlags: isCorporation
          ? CORPORATION_DELIVERIES
          : CHARACTER_DELIVERIES,
      };
    }
    return isCorporation
      ? {
          rootFlags: hangarFlags,
          includeLocations: corporation?.officeLocations,
        }
      : { excludeRootFlags: CHARACTER_OTHER_VIEWS };
  }, [view, isCorporation, hangarFlags, corporation]);

  const {
    locations,
    collection,
    byItemId,
    excludeItemIds,
    containerNames,
    isLoading,
    isError,
    error,
  } = useAssetTree({
    assets: isCorporation
      ? { scope: ASSET_SCOPE.CORPORATION, id }
      : { scope: ASSET_SCOPE.CHARACTER, id },
    blueprints: isCorporation
      ? { scope: BLUEPRINT_SCOPE.CORPORATION, id }
      : { scope: BLUEPRINT_SCOPE.CHARACTER, id },
    namesCharacter: character,
    namesScope: isCorporation ? "corporation" : "character",
    hideAssembledShips,
    ...narrow,
    // An owner the account no longer tracks has no token to ask with, so nothing is asked.
    enabled: Boolean(isCorporation ? corporation : character),
  });

  // The office selects elsewhere read the corporation's offices from the store, and a member's
  // assets are the only place they are stated.
  useEffect(() => {
    if (!isCorporation || !id) return;

    useUsersStore
      .getState()
      .account.actions.setCorporationOffices(id, officeLocationIds(collection));
  }, [isCorporation, id, collection]);

  if (isLoading || isError) {
    return isError ? (
      <PanelFallBack isLoading={false} isError error={error} />
    ) : (
      <PanelFallBack
        isLoading
        isError={false}
        loadingMessage="Gathering Location Data..."
      />
    );
  }

  return (
    <AssetTree
      locations={locations}
      byItemId={byItemId}
      containerNames={containerNames}
      excludeItemIds={excludeItemIds}
      compartments={isCorporation && view === "held" ? hangars : undefined}
      expanded={expanded}
      onToggle={toggle}
      search={search}
    />
  );
}
