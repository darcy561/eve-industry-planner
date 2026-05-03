import { ancientRelicIDs } from "../../../Context/defaultValues";
import { isNoAccessLocation } from "../assetLocationConstants";
import useUsersStore from "../../../Zustand/usersStore";

export function formatAssetLocation(locationFlag) {
  switch (locationFlag) {
    case "Hangar":
      return "Hangar";
    case "Unlocked":
    case "Autofit":
      return "Container";
    default:
      return "Other";
  }
}

export function sortLocationMapsAlphabetically(inputLocationMap, inputLocationNames) {
  const universeIDs = useUsersStore.getState().worldData.universeIDs;

  return new Map(
    [...inputLocationMap.entries()].sort((a, b) => {
      const nameA = inputLocationNames[a[0]]?.name || universeIDs[a[0]]?.name || "";
      const nameB = inputLocationNames[b[0]]?.name || universeIDs[b[0]]?.name || "";

      const locationA = inputLocationNames[a[0]] || universeIDs[a[0]];
      const locationB = inputLocationNames[b[0]] || universeIDs[b[0]];
      if (isNoAccessLocation(locationA) || isNoAccessLocation(locationB)) {
        if (isNoAccessLocation(locationA) && isNoAccessLocation(locationB)) return 0;
        if (isNoAccessLocation(locationA)) return 1;
        if (isNoAccessLocation(locationB)) return -1;
      }

      if (!nameA && !nameB) return 0;
      if (!nameA) return 1;
      if (!nameB) return -1;
      return nameA.localeCompare(nameB);
    })
  );
}

export function findAssetImageURL(asset, blueprintMap) {
  const typeID = asset.type_id;
  const baseImageUrl = `https://images.evetech.net/types/${typeID}`;

  if (!blueprintMap) {
    return `${baseImageUrl}/icon?size=32`;
  }
  const blueprintObject = blueprintMap.get(asset.item_id);
  if (blueprintObject) {
    if (blueprintObject.quantity === -2) {
      return `${baseImageUrl}/bpc?size=32`;
    }
    if (ancientRelicIDs.has(typeID)) {
      return `${baseImageUrl}/relic?size=32`;
    }
    return `${baseImageUrl}/bp?size=32`;
  }
  return `${baseImageUrl}/icon?size=32`;
}

export function buildAssetName(
  assetObject,
  assetLocationNames,
  isCorporation,
  corporation_id,
  fullItemList
) {
  const corpHangarName = corpLocationName();
  const assetObjectName = fullItemList?.[assetObject.type_id]?.name || "Unknown Item";
  const customAssetName = assetLocationNames.get(assetObject.item_id)?.name || "";
  return [corpHangarName, assetObjectName, customAssetName].join(" - ");

  function corpLocationName() {
    if (!isCorporation) return "";
    const corpHangars =
      useUsersStore.getState().account.actions.getCorporation(corporation_id)?.hangars ||
      [];

    return (
      corpHangars.find((i) => i.assetLocationRef === assetObject.location_flag)
        ?.name || ""
    );
  }
}
