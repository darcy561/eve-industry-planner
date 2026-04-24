export function convertAssetArrayIntoMapByTypeID(inputAssetArray) {
  const returnMap = new Map();
  if (!inputAssetArray) return returnMap;

  for (const asset of inputAssetArray) {
    if (returnMap.has(asset.type_id)) {
      returnMap.get(asset.type_id).push(asset);
    } else {
      returnMap.set(asset.type_id, [asset]);
    }
  }
  return returnMap;
}

export function countAssetQuantityFromMap(inputMap, requestTypeID) {
  const requestedTypeIDArray = inputMap.get(requestTypeID);
  if (!requestedTypeIDArray || !inputMap || !requestTypeID) return 0;

  return requestedTypeIDArray.reduce((total, { quantity }) => {
    return (total += quantity);
  }, 0);
}
