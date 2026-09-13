import { fetchTemplateCatalogSummaries } from "../../../../Functions/Endpoints/Private/groupTemplates";
import { showSnackbarError } from "../../../../Events/snackbarEvents";

export const GROUP_TEMPLATE_QUERY_KEYS = {
  catalog: ["group-templates-catalog"],
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
          5,
        );
        return [];
      }
    },
  };
}

export function invalidateTemplateCatalogQueries(queryClient) {
  return queryClient.invalidateQueries({
    queryKey: GROUP_TEMPLATE_QUERY_KEYS.catalog,
  });
}
