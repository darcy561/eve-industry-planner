import { findChildAssets, findParentAsset } from "./assetTraversal";

export function buildAssetMaps(assetList) {
  const assetItemMap = new Map();
  const assetsByLocationMap = new Map();
  const topLevelAssetLocations = new Map();
  const assetIDSet = new Set();

  assetList.forEach((item) => {
    const locationId = item.location_id;
    assetItemMap.set(item.item_id, item);

    if (assetsByLocationMap.has(locationId)) {
      assetsByLocationMap.get(locationId).push(item);
    } else {
      assetsByLocationMap.set(locationId, [item]);
    }
  });

  assetList.forEach(({ item_id }) => {
    if (assetsByLocationMap.has(item_id)) {
      assetIDSet.add(item_id);
    }
  });

  assetsByLocationMap.forEach((items, locationId) => {
    items.forEach((item) => {
      const assetLocation = item.location_id;
      if (!assetItemMap.has(assetLocation)) {
        topLevelAssetLocations.set(locationId, items);
      }
    });
  });

  return {
    topLevelAssetLocations,
    assetItemMap,
    assetsByLocationMap,
    assetIDSet,
  };
}

export function buildAssetMapsForCorporationOffices(assetList, corporationObject) {
  const officeLocations = corporationObject?.officeLocations ?? [];
  const hangarArray = corporationObject.hangars;
  const assetsByLocationMap = new Map();
  const topLevelAssetLocations = new Map();
  const assetIDSet = new Set();

  assetList.forEach((item) => {
    const locationID = item.location_id;
    if (assetsByLocationMap.has(locationID)) {
      assetsByLocationMap.get(locationID).push(item);
    } else {
      assetsByLocationMap.set(locationID, [item]);
    }
  });

  officeLocations.forEach((locationID) => {
    const hangarMap = new Map();
    const officeObjectLocation = assetsByLocationMap.get(locationID)[0]?.item_id;
    const officeAssets = assetsByLocationMap.get(officeObjectLocation) || [];

    hangarArray.forEach(({ assetLocationRef }) => {
      const filteredAssets = officeAssets.filter(
        (i) => i.location_flag === assetLocationRef
      );

      filteredAssets.forEach(({ item_id }) => {
        if (assetsByLocationMap.has(item_id)) {
          assetIDSet.add(item_id);
        }
      });

      hangarMap.set(assetLocationRef, filteredAssets);
    });

    topLevelAssetLocations.set(locationID, hangarMap);
  });

  return { topLevelAssetLocations, assetsByLocationMap, assetIDSet };
}

export function buildAssetTypeIDMaps(assetList, requestedTypeID) {
  const assetItemMap = new Map();
  const assetsByLocationMap = new Map();
  const topLevelAssetLocations = new Map();
  const assetIDSet = new Set();

  if (!assetList || !requestedTypeID) {
    return { assetItemMap, assetsByLocationMap, topLevelAssetLocations, assetIDSet };
  }

  const requestedTypeIDAssets = assetList.filter(
    (asset) => asset.type_id === requestedTypeID
  );
  assetList.forEach((asset) => {
    assetItemMap.set(asset.item_id, asset);
  });

  for (const asset of requestedTypeIDAssets) {
    findParentAsset(asset, assetList, assetsByLocationMap);
  }
  for (const asset of requestedTypeIDAssets) {
    findChildAssets(asset, assetList, assetsByLocationMap);
  }

  assetsByLocationMap.forEach((items, locationID) => {
    items.forEach((item) => {
      const assetLocation = item.location_id;
      if (!assetItemMap.has(assetLocation)) {
        topLevelAssetLocations.set(assetLocation, items);
      }
    });
  });

  assetList.forEach(({ item_id, location_flag }) => {
    if (assetsByLocationMap.has(item_id) && location_flag !== "OfficeFolder") {
      assetIDSet.add(item_id);
    }
  });

  return { assetsByLocationMap, topLevelAssetLocations, assetIDSet };
}

export function buildAssetLocationFlagMaps(assetList, requestedLocationFlag) {
  const assetItemMap = new Map();
  const assetsByLocationMap = new Map();
  const topLevelAssetLocations = new Map();
  const assetIDSet = new Set();

  if (!assetList || !requestedLocationFlag) {
    return { assetsByLocationMap, topLevelAssetLocations, assetIDSet };
  }

  const requestedLocationFlagAssets = assetList.filter(
    (asset) => asset.location_flag === requestedLocationFlag
  );

  assetList.forEach((asset) => {
    assetItemMap.set(asset.item_id, asset);
  });

  for (const initialAsset of requestedLocationFlagAssets) {
    findParentAsset(initialAsset, assetList, assetsByLocationMap);
  }
  for (const initialAsset of requestedLocationFlagAssets) {
    findChildAssets(initialAsset, assetList, assetsByLocationMap);
  }

  assetsByLocationMap.forEach((items, locationId) => {
    items.forEach((item) => {
      const assetLocation = item.location_id;
      if (!assetItemMap.has(assetLocation)) {
        topLevelAssetLocations.set(assetLocation, items);
      }
    });
  });

  assetList.forEach(({ item_id }) => {
    if (assetsByLocationMap.has(item_id)) {
      assetIDSet.add(item_id);
    }
  });

  return { assetsByLocationMap, topLevelAssetLocations, assetIDSet };
}

export function findAssetsInLocation(assetList, requestedLocationID) {
  const assetsByLocationMap = new Map();
  if (!assetList || !requestedLocationID) {
    return [];
  }

  const requestedLocationAssets = assetList.filter(
    (asset) => asset.location_id === requestedLocationID
  );

  requestedLocationAssets.forEach((item) => {
    const locationId = item.location_id;
    if (assetsByLocationMap.has(locationId)) {
      assetsByLocationMap.get(locationId).push(item);
    } else {
      assetsByLocationMap.set(locationId, [item]);
    }
  });

  for (const asset of requestedLocationAssets) {
    findChildAssets(asset, assetList, assetsByLocationMap);
  }

  return Array.from(assetsByLocationMap.values()).flat();
}
