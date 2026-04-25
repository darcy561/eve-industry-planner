import { listingType } from "../../../../../../../Context/defaultValues.jsx";
import GLOBAL_CONFIG from "../../../../../../../global-config-app";

const marketLabelById = Object.fromEntries(
  GLOBAL_CONFIG.MARKET_OPTIONS.map((entry) => [entry.id, entry.name])
);

const listingLabelById = Object.fromEntries(
  listingType.map((entry) => [entry.id, entry.name])
);

export function getListingModeLabel(listingSelect) {
  if (listingSelect === "buy") return "Buy";
  if (listingSelect === "sell") return "Sell";
  return listingSelect;
}

export function getListingOrdersLabel(listingSelect) {
  return listingLabelById[listingSelect] || listingSelect;
}

export function getMarketLocationLabel(marketSelect) {
  return marketLabelById[marketSelect] || marketSelect;
}

export function buildRowSourceText(marketSelect, listingSelect) {
  return `${getMarketLocationLabel(marketSelect)} | ${getListingOrdersLabel(
    listingSelect
  )}`;
}
