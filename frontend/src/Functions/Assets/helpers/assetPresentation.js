import { ancientRelicIDs } from "../../../Context/defaultValues";
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

      const noAccessName = "No Access To Location";
      if (nameA.includes(noAccessName) || nameB.includes(noAccessName)) {
        if (nameA.includes(noAccessName) && nameB.includes(noAccessName)) return 0;
        if (nameA.includes(noAccessName)) return 1;
        if (nameB.includes(noAccessName)) return -1;
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
