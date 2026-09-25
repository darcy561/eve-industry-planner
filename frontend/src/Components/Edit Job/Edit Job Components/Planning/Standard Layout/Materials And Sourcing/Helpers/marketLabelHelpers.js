import { ORDER_TYPES } from "../../../../../../../Context/defaultValues.jsx";
import { sourceNameIn } from "../../../../../../../Functions/MarketData/registry/marketSources.js";
import { readMarketSources } from "../../../../../../../Hooks/Static/useMarketSources";

const listingLabelById = Object.fromEntries(
  ORDER_TYPES.map((entry) => [entry.id, entry.name]),
);

const listingModeLabelById = {
  buy: "Buy",
  sell: "Sell",
  buyP95: "Buy 95%",
  sellP05: "Sell 5%",
};

export function getListingModeLabel(orderType) {
  return listingModeLabelById[orderType] || orderType;
}

export function getListingOrdersLabel(orderType) {
  return listingLabelById[orderType] || orderType;
}

export function getMarketLocationLabel(marketLocation) {
  // Read per call rather than mapped once at module load: the registry gains
  // reader-saved markets while the app runs, and a map built at import time
  // would name only the four it started with.
  return sourceNameIn(readMarketSources(), marketLocation);
}

export function buildRowSourceText(marketLocation, orderType) {
  return `${getMarketLocationLabel(marketLocation)} | ${getListingOrdersLabel(orderType)}`;
}
