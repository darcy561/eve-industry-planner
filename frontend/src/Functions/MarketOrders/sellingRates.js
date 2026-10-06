import {
  brokerFeeRates,
  marketSkillIDs,
  salesTaxRates,
} from "../../Context/defaultValues";
import getStationData from "../EveESI/World/getStationData";
import { raceFactionsQuery } from "../../Hooks/React Query/World/raceFactions";
import { fetchNames } from "../../Hooks/React Query/World/names";
import { getCachedCharacterSkills } from "../../Hooks/EveEsi/Character/useGetCharacterSkills";
import { getCachedCharacterStandings } from "../../Hooks/EveEsi/Character/useGetCharacterStandings";
import { SALE_LOCATION_KIND } from "./saleLocations";

/**
 * @typedef {object} SellerSkills
 * @property {number} brokerRelations - Active level, 0 when untrained or signed out
 * @property {number} accounting - Active level, 0 when untrained or signed out
 * @property {boolean} [unknown] - The levels could not be read, so the zeroes
 *   stand in for figures rather than reporting untrained skills
 */

/**
 * A character's market skill levels, defaulting to untrained; a skill the character has not
 * trained reads as untrained rather than missing.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {string|null} characterHash
 * @returns {SellerSkills}
 */
export function getSellerSkills(queryClient, characterHash) {
  if (!characterHash) {
    return { brokerRelations: 0, accounting: 0 };
  }

  const { data, isLoading, isError } = getCachedCharacterSkills(
    queryClient,
    characterHash,
  );

  if (isLoading || isError || !data) {
    return { brokerRelations: 0, accounting: 0, unknown: true };
  }

  return {
    brokerRelations: data?.[marketSkillIDs.brokerRelations]?.activeLevel ?? 0,
    accounting: data?.[marketSkillIDs.accounting]?.activeLevel ?? 0,
    unknown: false,
  };
}

/**
 * The percentage charged to list an item at a sale location: a citadel owner's rate as given, or
 * a station's derived from the seller's skill and standings.
 *
 * @param {import("./saleLocations").SaleLocation} saleLocation
 * @param {import("@tanstack/react-query").QueryClient} [queryClient]
 * @param {string|null} [characterHash]
 * @returns {Promise<number>} Percentage
 */
export async function brokerFeeRate(saleLocation, queryClient, characterHash) {
  const { rate } = await brokerFeeWorking(
    saleLocation,
    queryClient,
    characterHash,
  );
  return rate;
}

/**
 * @typedef {object} FeeTerm
 * @property {string} id
 * @property {string} label - What the reduction came from
 * @property {number} amount - Percentage points it took off
 * @property {number} level - The skill level or standing behind it
 * @property {boolean} [unknown] - The figure could not be read, so the term took
 *   nothing off for want of a number rather than because there was none
 * @property {string|null} [entityName] - Who the standing is with, where the
 *   term is a standing and the name resolved
 */

/**
 * @typedef {object} BrokerFeeWorking
 * @property {string} kind - One of SALE_LOCATION_KIND
 * @property {number} rate - Percentage
 * @property {number|null} base - What the rate started at; null at a structure,
 *   where the owner's rate is not derived from anything
 * @property {FeeTerm[]} terms - Each subtraction, in the order they apply
 */

/**
 * What an NPC station's broker fee is reduced by, in the order the working lists them.
 *
 * @type {Record<string, {id: string, label: string}>}
 */
export const BROKER_FEE_TERMS = {
  brokerRelations: { id: "brokerRelations", label: "Broker Relations" },
  faction: { id: "faction", label: "Faction standing" },
  corporation: { id: "corporation", label: "Corporation standing" },
};

/**
 * The broker fee and what it is made of: a station's rate with each subtraction, or a citadel
 * owner's rate with nothing to show but the number.
 *
 * @param {import("./saleLocations").SaleLocation} saleLocation
 * @param {import("@tanstack/react-query").QueryClient} [queryClient]
 * @param {string|null} [characterHash]
 * @returns {Promise<BrokerFeeWorking>}
 */
export async function brokerFeeWorking(
  saleLocation,
  queryClient,
  characterHash,
) {
  if (saleLocation?.kind === SALE_LOCATION_KIND.CITADEL) {
    return {
      kind: SALE_LOCATION_KIND.CITADEL,
      rate: saleLocation.brokerFee,
      base: null,
      terms: [],
    };
  }

  const { brokerRelations, unknown: skillsUnknown } = getSellerSkills(
    queryClient,
    characterHash,
  );
  const { faction, corporation, unknown, factionName, corporationName } =
    await getStationStandings(
      saleLocation?.feeStationID,
      queryClient,
      characterHash,
    );

  const terms = [
    {
      ...BROKER_FEE_TERMS.brokerRelations,
      amount: brokerFeeRates.brokerRelations * brokerRelations,
      level: brokerRelations,
      unknown: skillsUnknown,
    },
    {
      ...BROKER_FEE_TERMS.faction,
      amount: brokerFeeRates.factionStanding * faction,
      level: faction,
      entityName: factionName,
      unknown,
    },
    {
      ...BROKER_FEE_TERMS.corporation,
      amount: brokerFeeRates.corporationStanding * corporation,
      level: corporation,
      entityName: corporationName,
      unknown,
    },
  ];

  return {
    kind: SALE_LOCATION_KIND.NPC_STATION,
    base: brokerFeeRates.base,
    terms,
    rate: terms.reduce((rate, term) => rate - term.amount, brokerFeeRates.base),
  };
}

/**
 * The sales tax at an Accounting level: Accounting takes a share of the base rather than subtracting.
 *
 * @param {number} accounting - Skill level
 * @returns {number} Percentage
 */
export function salesTaxRateAt(accounting) {
  return salesTaxRates.base * (1 - salesTaxRates.accounting * accounting);
}

/**
 * The sales tax and what it is made of. Accounting is the only thing that moves
 * it, and it takes a share of the base rather than subtracting from it.
 *
 * @param {import("@tanstack/react-query").QueryClient} [queryClient]
 * @param {string|null} [characterHash]
 * @returns {{base: number, accounting: number, rate: number}}
 */
export function salesTaxWorking(queryClient, characterHash) {
  const { accounting, unknown } = getSellerSkills(queryClient, characterHash);

  return {
    base: salesTaxRates.base,
    accounting,
    unknown,
    rate: salesTaxRateAt(accounting),
  };
}

/**
 * What a listing costs in ISK, never less than the floor the game charges.
 *
 * @param {number} rate - Percentage, from brokerFeeRate
 * @param {number} value - Total ISK value of the order
 * @returns {number}
 */
export function brokerFeeAmount(rate, value) {
  return Math.max((rate / 100) * value, brokerFeeRates.minimumFee);
}

/**
 * What a sale is taxed in ISK. No floor: unlike the broker fee, tax scales all the
 * way down.
 *
 * @param {number} rate - Percentage, from salesTaxWorking
 * @param {number} value - Total ISK value of the sale
 * @returns {number}
 */
export function salesTaxAmount(rate, value) {
  return (rate / 100) * value;
}

/**
 * The seller's standings with the faction and corporation owning a station.
 *
 * @param {number|null|undefined} stationID
 * @param {import("@tanstack/react-query").QueryClient} [queryClient]
 * @param {string|null} [characterHash]
 * @returns {Promise<{faction: number, corporation: number, unknown: boolean}>}
 */
async function getStationStandings(stationID, queryClient, characterHash) {
  if (!stationID || !characterHash) {
    return { faction: 0, corporation: 0, unknown: true };
  }

  const {
    data: standings,
    isLoading,
    isError,
  } = getCachedCharacterStandings(queryClient, characterHash);

  if (isLoading || isError || !Array.isArray(standings)) {
    return { faction: 0, corporation: 0, unknown: true };
  }
  const station = await getStationData(stationID);

  const raceFactions = await queryClient.query(raceFactionsQuery());
  const factionID = raceFactions.get(station.race_id) ?? null;

  const names = await fetchNames(queryClient, [factionID, station.owner]).catch(
    () => ({}),
  );

  return {
    faction: standingFrom(standings, factionID, STANDING_FROM.FACTION),
    corporation: standingFrom(
      standings,
      station.owner,
      STANDING_FROM.CORPORATION,
    ),
    factionName: names?.[factionID]?.name ?? null,
    corporationName: names?.[station.owner]?.name ?? null,
    unknown: false,
  };
}

/**
 * The categories ESI reports a standing against; a faction and an NPC corporation can share an
 * id, so the category is part of the match.
 *
 * @enum {string}
 */
const STANDING_FROM = {
  FACTION: "faction",
  CORPORATION: "npc_corp",
};

/**
 * One standing from the character's list, or none where they hold none.
 *
 * @param {Array<{from_id: number, from_type: string, standing: number}>} [standings]
 * @param {number|null} fromID
 * @param {string} fromType - One of STANDING_FROM
 * @returns {number}
 */
function standingFrom(standings, fromID, fromType) {
  if (fromID == null) return 0;

  return (
    standings?.find((i) => i.from_id === fromID && i.from_type === fromType)
      ?.standing ?? 0
  );
}
