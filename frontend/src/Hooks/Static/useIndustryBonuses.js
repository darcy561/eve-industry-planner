import { useCachedData } from "../App/useCachedData";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";

const EMPTY_CATALOGUE = { families: {}, sources: {} };

/**
 * The rigs and structures the game publishes an industry bonus for, and the item
 * families those bonuses are scoped to.
 *
 * @returns {{catalogue: Object, isLoading: boolean, isError: boolean}}
 */
export function useIndustryBonuses() {
  const { data, isLoading, isError } = useCachedData(
    CACHED_DATA_FILES.INDUSTRY_BONUSES,
  );

  return { catalogue: data ?? EMPTY_CATALOGUE, isLoading, isError };
}
