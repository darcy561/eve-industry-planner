import useUsersStore from "../../../../../../Zustand/usersStore";

export function getMarketPriceForType(typeID, marketSelect, listingSelect) {
  const marketData = useUsersStore
    .getState()
    .worldData.actions.findMarketData(typeID);

  return marketData?.[marketSelect]?.[listingSelect] || 0;
}

export function getEffectiveMaterialPriceHub(
  layout,
  materialTypeID,
  defaultMarketSelect,
  defaultListingSelect
) {
  const override = layout?.materialPriceOverrides?.[materialTypeID];

  return {
    marketSelect: override?.marketDisplay ?? defaultMarketSelect,
    listingSelect: override?.orderDisplay ?? defaultListingSelect,
  };
}
