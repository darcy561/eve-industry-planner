import {
  buildAssetLocationFlagMaps,
  buildAssetMaps,
  buildAssetMapsForCorporationOffices,
  buildAssetTypeIDMaps,
  findAssetsInLocation,
} from "./helpers/assetMaps";
import {
  buildAssetName,
  findAssetImageURL,
  formatAssetLocation,
  sortLocationMapsAlphabetically,
} from "./helpers/assetPresentation";
import { fetchAssets } from "./helpers/assetFetch";
import {
  convertAssetArrayIntoMapByTypeID,
  countAssetQuantityFromMap,
} from "./helpers/assetQuantities";

export {
  buildAssetMaps,
  buildAssetName,
  buildAssetLocationFlagMaps,
  buildAssetTypeIDMaps,
  convertAssetArrayIntoMapByTypeID,
  countAssetQuantityFromMap,
  findAssetImageURL,
  findAssetsInLocation,
  sortLocationMapsAlphabetically,
};

export const buildAssetMapsCorpOffices = buildAssetMapsForCorporationOffices;
export const findAssets = fetchAssets;
export const formatLocation = formatAssetLocation;
