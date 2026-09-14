import { LISTING_TYPES } from "../../../../../../../Context/defaultValues.jsx";
import GLOBAL_CONFIG from "../../../../../../../global-config-app";

const marketLabelById = Object.fromEntries(
  GLOBAL_CONFIG.MARKET_OPTIONS.map((entry) => [entry.id, entry.name]),
);

const listingLabelById = Object.fromEntries(
  LISTING_TYPES.map((entry) => [entry.id, entry.name]),
);

const listingModeLabelById = {
  buy: "Buy",
  sell: "Sell",
  buyP95: "Buy 95%",
  sellP05: "Sell 5%",
};

export function getListingModeLabel(listingType) {
  return listingModeLabelById[listingType] || listingType;
}

export function getListingOrdersLabel(listingType) {
  return listingLabelById[listingType] || listingType;
}

export function getMarketLocationLabel(marketLocation) {
  return marketLabelById[marketLocation] || marketLocation;
}

export function buildRowSourceText(marketLocation, listingType) {
  return `${getMarketLocationLabel(marketLocation)} | ${getListingOrdersLabel(listingType)}`;
}
