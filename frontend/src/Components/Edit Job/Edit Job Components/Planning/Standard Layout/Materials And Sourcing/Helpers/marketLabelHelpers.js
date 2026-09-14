import { LISTING_TYPES } from "../../../../../../../Context/defaultValues.jsx";
import { sourceNameIn } from "../../../../../../../Functions/MarketData/marketSources";
import { readMarketSources } from "../../../../../../../Hooks/Static/useMarketSources";

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
  // Read per call rather than mapped once at module load: the registry gains
  // reader-saved markets while the app runs, and a map built at import time
  // would name only the four it started with.
  return sourceNameIn(readMarketSources(), marketLocation);
}

export function buildRowSourceText(marketLocation, listingType) {
  return `${getMarketLocationLabel(marketLocation)} | ${getListingOrdersLabel(listingType)}`;
}
