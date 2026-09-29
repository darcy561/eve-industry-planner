import { getIndustryBonuses } from "../Helper/getCachedData";
import staticFile from "./staticFile";

const EMPTY_CATALOGUE = { families: {}, sources: {} };

const catalogue = staticFile(
  getIndustryBonuses,
  (data) => data || EMPTY_CATALOGUE,
);

export const primeIndustryBonuses = catalogue.prime;
export const readIndustryBonusCatalogue = catalogue.read;
export const resetIndustryBonuses = catalogue.reset;
