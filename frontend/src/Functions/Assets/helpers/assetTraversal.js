export function findParentAsset(initialAsset, assetList, assetsByLocationMap) {
  const parentAsset = assetList.find(
    (asset) => asset.item_id === initialAsset.location_id
  );

  if (parentAsset) {
    const itemID = parentAsset.item_id;
    if (!assetsByLocationMap.has(itemID)) {
      assetsByLocationMap.set(itemID, []);
    }
    const locationAssets = assetsByLocationMap.get(itemID);
    const isItemIncluded = locationAssets.some(
      (i) => i.item_id === parentAsset.item_id
    );
    if (!isItemIncluded) {
      locationAssets.push(initialAsset);
      findParentAsset(parentAsset, assetList, assetsByLocationMap);
    }
  } else {
    const locationID = initialAsset.location_id;
    if (!assetsByLocationMap.has(locationID)) {
      assetsByLocationMap.set(locationID, [initialAsset]);
    } else {
      const locationAssets = assetsByLocationMap.get(locationID);
      const isItemIncluded = locationAssets.some(
        (i) => i.item_id === initialAsset.item_id
      );
      if (!isItemIncluded) {
        locationAssets.push(initialAsset);
      }
    }
  }
}

export function findChildAssets(initialAsset, assetList, assetsByLocationMap) {
  const children = assetList.filter(
    (asset) => asset.location_id === initialAsset.item_id
  );

  for (const childAsset of children) {
    const locationID = childAsset.location_id;
    if (!assetsByLocationMap.has(locationID)) {
      assetsByLocationMap.set(locationID, [childAsset]);
    } else {
      const locationAssets = assetsByLocationMap.get(locationID);
      const isItemIncluded = locationAssets.some(
        (i) => i.item_id === childAsset.item_id
      );
      if (!isItemIncluded) {
        locationAssets.push(childAsset);
        findChildAssets(childAsset, assetList, assetsByLocationMap);
      }
    }
  }
}
