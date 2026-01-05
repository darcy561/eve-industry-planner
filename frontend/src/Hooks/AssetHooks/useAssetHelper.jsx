import { ancientRelicIDs } from "../../Context/defaultValues";
import getCorpAssets from "../../Functions/EveESI/Corporation/getAssets";
import getCharacterAssets from "../../Functions/EveESI/Character/getAssets";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Custom hook that provides comprehensive asset management utilities for EVE Online assets.
 * 
 * This hook provides a collection of functions for:
 * - Building asset maps and hierarchies for both character and corporation assets
 * - Organizing assets by location, type, and location flags
 * - Finding parent-child relationships in asset structures
 * - Formatting asset names and generating image URLs
 * - Converting asset arrays into organized maps
 * - Counting asset quantities by type
 * - Sorting location maps alphabetically
 * 
 * The hook handles both character assets and corporation office structures,
 * including complex nested asset hierarchies and location flag management.
 * 
 * @returns {Object} Object containing asset management utility functions
 * @returns {Function} returns.buildAssetMaps - Builds asset maps for character assets
 * @returns {Function} returns.buildAssetMapsCorpOffices - Builds asset maps for corporation offices
 * @returns {Function} returns.buildAssetName - Builds formatted asset names
 * @returns {Function} returns.buildAssetLocationFlagMaps - Builds maps by location flag
 * @returns {Function} returns.buildAssetTypeIDMaps - Builds maps by type ID
 * @returns {Function} returns.convertAssetArrayIntoMapByTypeID - Converts asset array to type ID map
 * @returns {Function} returns.countAssetQuantityFromMap - Counts quantities by type ID
 * @returns {Function} returns.findAssets - Finds assets for user/corporation
 * @returns {Function} returns.findAssetImageURL - Generates asset image URLs
 * @returns {Function} returns.findAssetsInLocation - Finds assets in specific location
 * @returns {Function} returns.formatLocation - Formats location flags
 * @returns {Function} returns.sortLocationMapsAlphabetically - Sorts location maps alphabetically
 * 
 * @example
 * function AssetManager() {
 *   const {
 *     buildAssetMaps,
 *     findAssets,
 *     convertAssetArrayIntoMapByTypeID
 *   } = useAssetHelperHooks();
 * 
 *   const handleLoadAssets = async (userObj) => {
 *     const assets = await findAssets(userObj);
 *     const assetMaps = buildAssetMaps(assets);
 *     const typeMap = convertAssetArrayIntoMapByTypeID(assets);
 *   };
 * 
 *   return <div>Asset management interface</div>;
 * }
 */
export function useAssetHelperHooks() {
  const universeIDs = useUsersStore((state) => state.worldData.universeIDs);

  function formatLocation(locationFlag) {
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

  function buildAssetMaps(assetList) {
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

  function buildAssetMapsCorpOffices(assetList, corporationObject) {
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
      const officeObjectLocation =
        assetsByLocationMap.get(locationID)[0]?.item_id;
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

  function buildAssetTypeIDMaps(assetList, requestedTypeID) {
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
      if (
        assetsByLocationMap.has(item_id) &&
        location_flag !== "OfficeFolder"
      ) {
        assetIDSet.add(item_id);
      }
    });

    return {
      assetsByLocationMap,
      topLevelAssetLocations,
      assetIDSet,
    };
  }

  function buildAssetLocationFlagMaps(assetList, requestedLocationFlag) {
    const assetItemMap = new Map();
    const assetsByLocationMap = new Map();
    const topLevelAssetLocations = new Map();
    const assetIDSet = new Set();

    if (!assetList || !requestedLocationFlag)
      return { assetsByLocationMap, topLevelAssetLocations, assetIDSet };

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

  function findParentAsset(initialAsset, assetList, assetsByLocationMap) {
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

  function findChildAssets(initialAsset, assetList, assetsByLocationMap) {
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

  function sortLocationMapsAlphabetically(
    inputLocationMap,
    inputLocationNames
  ) {
    return new Map(
      [...inputLocationMap.entries()].sort((a, b) => {
        const nameA =
          inputLocationNames[a[0]]?.name || universeIDs[a[0]]?.name || "";
        const nameB =
          inputLocationNames[b[0]]?.name || universeIDs[b[0]]?.name || "";

        const noAccessName = "No Access To Location";

        if (nameA.includes(noAccessName) || nameB.includes(noAccessName)) {
          if (nameA.includes(noAccessName) && nameB.includes(noAccessName)) {
            return 0;
          } else if (nameA.includes(noAccessName)) {
            return 1;
          } else if (nameB.includes(noAccessName)) {
            return -1;
          }
        }

        if (!nameA && !nameB) {
          return 0;
        } else if (!nameA) {
          return 1;
        } else if (!nameB) {
          return -1;
        }
        return nameA.localeCompare(nameB);
      })
    );
  }

  function findAssetImageURL(asset, blueprintMap) {
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

  function buildAssetName(
    assetObject,
    assetLocationNames,
    isCorporation,
    corporation_id,
    fullItemList
  ) {
    const corpHangarName = corpLocationName();
    const assetObjectName = findAssetObjectName();
    const customAssetName = findCustomAssetName();

    return [corpHangarName, assetObjectName, customAssetName].join(" - ");

    function corpLocationName() {
      if (!isCorporation) return "";
      const corpHangars =
        useUsersStore
          .getState()
          .users.actions.getCorporationObject(corporation_id)
          ?.hangars || [];

      return (
        corpHangars.find(
          (i) => i.assetLocationRef === assetObject.location_flag
        )?.name || ""
      );
    }

    function findAssetObjectName() {
      return fullItemList?.[assetObject.type_id]?.name || "Unknown Item";
    }

    function findCustomAssetName() {
      return assetLocationNames.get(assetObject.item_id)?.name || "";
    }
  }

  function findAssetsInLocation(assetList, requestedLocationID) {
    const assetItemMap = new Map();
    const assetsByLocationMap = new Map();

    if (!assetList || !requestedLocationID) {
      return [];
    }

    const requestedLocationAssets = assetList.filter(
      (asset) => asset.location_id === requestedLocationID
    );

    requestedLocationAssets.forEach((item) => {
      const locationId = item.location_id;
      assetItemMap.set(item.item_id, item);

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

  function convertAssetArrayIntoMapByTypeID(inputAssetArray) {
    let returnMap = new Map();
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

  function countAssetQuantityFromMap(inputMap, requestTypeID) {
    const requestedTypeIDArray = inputMap.get(requestTypeID);
    if (!requestedTypeIDArray || !inputMap || !requestTypeID) return 0;

    return requestedTypeIDArray.reduce((total, { quantity }) => {
      return (total += quantity);
    }, 0);
  }

  async function findAssets(userObj = {}, isCorporation = false) {
    try {
      if (!userObj) return [];
      const assetString = isCorporation
        ? `corpAssets_${userObj?.corporation_id}`
        : `assets_${userObj?.CharacterHash}`;

      const functionToCall = isCorporation ? getCorpAssets : getCharacterAssets;
      let matchedAssets = JSON.parse(sessionStorage.getItem(assetString));

      if (!matchedAssets) {
        matchedAssets = await functionToCall(userObj);
      }
      return matchedAssets;
    } catch (err) {
      console.error(err.message);
      return [];
    }
  }

  return {
    buildAssetMaps,
    buildAssetMapsCorpOffices,
    buildAssetName,
    buildAssetLocationFlagMaps,
    buildAssetTypeIDMaps,
    convertAssetArrayIntoMapByTypeID,
    countAssetQuantityFromMap,
    findAssets,
    findAssetImageURL,
    findAssetsInLocation,
    formatLocation,
    sortLocationMapsAlphabetically,
  };
}
