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
 * What it costs to list an item and to sell it. Each charge is a rate and an
 * amount rather than one figure, so a planned sale and a real order read the same
 * formula.
 */

/**
 * @typedef {object} SellerSkills
 * @property {number} brokerRelations - Active level, 0 when untrained or signed out
 * @property {number} accounting - Active level, 0 when untrained or signed out
 * @property {boolean} [unknown] - The levels could not be read, so the zeroes
 *   stand in for figures rather than reporting untrained skills
 */

/**
 * A character's market skill levels, defaulting to untrained.
 *
 * A skill absent from `bpSkills.json` never reaches this map, so it reads as
 * untrained rather than as missing.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {string|null} characterHash
 * @returns {SellerSkills}
 */
export function getSellerSkills(queryClient, characterHash) {
  // Signed out is the absence of a character, not of a query client: guarding on
  // the client would turn a wiring mistake into a silently higher fee instead of
  // a thrown error.
  if (!characterHash) {
    return { brokerRelations: 0, accounting: 0 };
  }

  const { data, isLoading, isError } = getCachedCharacterSkills(
    queryClient,
    characterHash,
  );

  // Same rule as standings: a level that could not be read is not level zero,
  // and quoting the untrained rate for it says the seller has not trained
  // something they may well have.
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
 * The percentage charged to list an item at a sale location.
 *
 * A citadel's rate is its owner's and is used as given — Broker Relations does not
 * reduce it, and there is no faction or NPC corporation to hold standing with. A
 * station's is derived from the seller instead, so the same station quotes two
 * characters different rates.
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
 * What an NPC station's broker fee is reduced by, and in what order it is read.
 *
 * Named here rather than at the row that draws them: the panel states these
 * three while the rates are still being worked out, so the list it reserves room
 * for and the list it fills in are the same list.
 *
 * @type {Record<string, {id: string, label: string}>}
 */
export const BROKER_FEE_TERMS = {
  brokerRelations: { id: "brokerRelations", label: "Broker Relations" },
  faction: { id: "faction", label: "Faction standing" },
  corporation: { id: "corporation", label: "Corporation standing" },
};

/**
 * The broker fee and what it is made of.
 *
 * A station's rate is worth showing as working: it is derived from the seller's
 * own skill and standings, and seeing the subtractions is what makes the figure
 * checkable against the client. A structure's is a number its owner set, so
 * there is nothing to show but the number.
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
    rate: salesTaxRates.base * (1 - salesTaxRates.accounting * accounting),
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
  // No character and no station both mean the standings are unknown rather than
  // absent: nobody has said the seller holds none.
  if (!stationID || !characterHash) {
    return { faction: 0, corporation: 0, unknown: true };
  }

  const {
    data: standings,
    isLoading,
    isError,
  } = getCachedCharacterStandings(queryClient, characterHash);

  // Absent is not empty. A read still in flight, one that failed, and one the
  // token is not allowed to make all leave the fee quoted as though the seller
  // had ground no standing anywhere — which is a claim, and usually the wrong
  // one. The accessor hands back an empty list for the first two, so the state
  // has to be read rather than the list inspected.
  if (isLoading || isError || !Array.isArray(standings)) {
    return { faction: 0, corporation: 0, unknown: true };
  }
  const station = await getStationData(stationID);

  // Read through the station rather than guarding it: getStationData swallows its
  // own errors and resolves to null, so this is what turns a failed lookup into a
  // rejected promise. Defaulting to no standings instead would quote a plausible
  // fee the seller does not owe, and the Selling stage stores the fee it links.
  //
  // The station names the race that built it; the standing is held against that
  // race's faction, so the two are not the same id and looking the standing up by
  // the race finds nothing.
  const raceFactions = await queryClient.query(raceFactionsQuery());
  const factionID = raceFactions.get(station.race_id) ?? null;

  // Named so a reader can check the answer. Cosmetic, so a failure here does not
  // take the fee down with it — the figures are still right without them.
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
 * The categories ESI reports a standing against. A faction and an NPC
 * corporation can hold the same id in different categories, so the kind is part
 * of the match rather than the id alone.
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
