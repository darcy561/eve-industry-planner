import { fetchTemplateCatalogSummaries } from "../../../../Functions/Endpoints/Private/groupTemplates";
import { getFullItemList } from "../../../../Functions/Helper/getCachedData";
import { showSnackbarError } from "../../../../Events/snackbarEvents";

export const GROUP_TEMPLATE_QUERY_KEYS = {
  catalog: ["group-templates-catalog"],
  fullItemList: ["full-item-list"],
};

export function buildCatalogQueryOptions(querySuffix, enabled) {
  return {
    queryKey: [...GROUP_TEMPLATE_QUERY_KEYS.catalog, querySuffix],
    enabled,
    queryFn: async () => {
      try {
        return await fetchTemplateCatalogSummaries();
      } catch (e) {
        showSnackbarError(
          e instanceof Error ? e.message : "Failed to load templates",
          5
        );
        return [];
      }
    },
  };
}

export function buildFullItemListQueryOptions(enabled) {
  return {
    queryKey: GROUP_TEMPLATE_QUERY_KEYS.fullItemList,
    enabled,
    staleTime: 1000 * 60 * 15,
    queryFn: async () => {
      try {
        return (await getFullItemList()) || null;
      } catch (e) {
        showSnackbarError(
          e instanceof Error ? e.message : "Failed to load item names",
          5
        );
        return null;
      }
    },
  };
}

export function invalidateTemplateCatalogQueries(queryClient) {
  return queryClient.invalidateQueries({
    queryKey: GROUP_TEMPLATE_QUERY_KEYS.catalog,
  });
}
