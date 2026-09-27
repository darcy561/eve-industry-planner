import { ORDER_TYPES } from "../../../../../../../Context/defaultValues.jsx";
import {
  allMarketSources,
  sourceNameIn,
} from "../../../../../../../Functions/MarketData/registry/marketSources.js";

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
  return sourceNameIn(allMarketSources(), marketLocation);
}

export function buildRowSourceText(marketLocation, orderType) {
  return `${getMarketLocationLabel(marketLocation)} | ${getListingOrdersLabel(orderType)}`;
}
