import GLOBAL_CONFIG from "../../../../../../../global-config-app";

const { PRIMARY_THEME, SECONDARY_THEME } = GLOBAL_CONFIG;

export function selectRowHighlightColor(theme, displayPopover) {
  if (!displayPopover) return null;

  switch (theme.palette.mode) {
    case PRIMARY_THEME:
      return theme.palette.secondary.highlight;
    case SECONDARY_THEME:
      return theme.palette.secondary.highlight;
    default:
      return theme.palette.secondary.main;
  }
}

export function selectMarketPriceColor(marketUnitPrice, childBuildUnitPrice) {
  const comparison = compareMarketAndChildBuildPrices(
    marketUnitPrice,
    childBuildUnitPrice
  );
  if (comparison === "equal" || comparison === "none") return null;
  return comparison === "market-cheaper" ? "success.main" : "error.main";
}

export function selectChildBuildPriceColor(marketUnitPrice, childBuildUnitPrice) {
  const comparison = compareMarketAndChildBuildPrices(
    marketUnitPrice,
    childBuildUnitPrice
  );
  if (comparison === "equal" || comparison === "none") return null;
  return comparison === "child-cheaper" ? "success.main" : "error.main";
}

function compareMarketAndChildBuildPrices(marketUnitPrice, childBuildUnitPrice) {
  if (childBuildUnitPrice === 0) return "none";
  if (marketUnitPrice === childBuildUnitPrice) return "equal";
  return marketUnitPrice < childBuildUnitPrice
    ? "market-cheaper"
    : "child-cheaper";
}
