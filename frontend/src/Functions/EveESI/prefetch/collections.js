import {
  characterSkillsQuery,
  characterSkillsQueryGroup,
} from "../../../Hooks/React Query/Character/skills";
import {
  characterStandingsQuery,
  characterStandingsQueryGroup,
} from "../../../Hooks/React Query/Character/standings";
import {
  characterBlueprintsQuery,
  characterBlueprintsQueryGroup,
} from "../../../Hooks/React Query/Character/blueprints";
import {
  characterIndustryJobsQuery,
  characterIndustryJobsQueryGroup,
} from "../../../Hooks/React Query/Character/industryJobs";
import {
  characterHistoricMarketOrdersQuery,
  characterHistoricMarketOrdersQueryGroup,
} from "../../../Hooks/React Query/Character/historicMarketOrders";
import {
  characterJournalQuery,
  characterJournalQueryGroup,
} from "../../../Hooks/React Query/Character/journal";
import {
  characterMarketOrdersQuery,
  characterMarketOrdersQueryGroup,
} from "../../../Hooks/React Query/Character/marketOrders";
import {
  characterTransactionsQuery,
  characterTransactionsQueryGroup,
} from "../../../Hooks/React Query/Character/transactions";
import {
  characterAssetsQuery,
  characterAssetsQueryGroup,
} from "../../../Hooks/React Query/Character/assets";
import {
  corporationBlueprintsQuery,
  corporationBlueprintsQueryGroup,
} from "../../../Hooks/React Query/Corporation/blueprints";
import {
  corporationIndustryJobsQuery,
  corporationIndustryJobsQueryGroup,
} from "../../../Hooks/React Query/Corporation/industryJobs";
import {
  corporationHistoricMarketOrdersQuery,
  corporationHistoricMarketOrdersQueryGroup,
} from "../../../Hooks/React Query/Corporation/historicMarketOrders";
import {
  corporationJournalQuery,
  corporationJournalQueryGroup,
} from "../../../Hooks/React Query/Corporation/journal";
import {
  corporationMarketOrdersQuery,
  corporationMarketOrdersQueryGroup,
} from "../../../Hooks/React Query/Corporation/marketOrders";
import {
  corporationTransactionsQuery,
  corporationTransactionsQueryGroup,
} from "../../../Hooks/React Query/Corporation/transactions";
import {
  corporationAssetsQuery,
  corporationAssetsQueryGroup,
} from "../../../Hooks/React Query/Corporation/assets";

/**
 * How often a collection is fetched, and therefore what its query is keyed by.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const SCOPE = Object.freeze({
  /** Once per linked character. */
  CHARACTER: "character",
  /** Once per corporation — ESI returns the whole list to any member holding the role. */
  CORPORATION: "corporation",
  /** Once per corporation wallet division — role access is granted a division at a time. */
  CORPORATION_DIVISION: "corporation-division",
});

/**
 * When a collection is fetched relative to the first usable screen.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const PHASE = Object.freeze({
  /** The planner and the recipe search cannot render without these. */
  FIRST_PAINT: "first-paint",
  /** Read only on the accounting surfaces, so they may trail. */
  DEFERRED: "deferred",
  /** Never prefetched; fetched when a consumer mounts. */
  ON_DEMAND: "on-demand",
});

/**
 * Every ESI collection the app holds, with how often it is fetched and when.
 *
 * The scheduler computes its work from this table rather than from a list repeated per character,
 * so a collection is described in exactly one place. `group` names the ESI rate-limit bucket the
 * collection spends from, taken from the query module that spends it. `esiScope` is the OAuth
 * scope ESI requires of the token, so a character linked before a scope was added can be shown as
 * lacking access rather than as failing.
 *
 * Assets are listed as `ON_DEMAND` rather than left out: they are by far the largest collection and
 * only three surfaces read them, so prefetching them would spend the greatest share of the login
 * budget on data most sessions never open. Their absence from the prefetch is a decision, and this
 * row is where it is recorded.
 *
 * @type {ReadonlyArray<{key: string, name: string, scope: string, esiScope: string, phase: string, group: string, query: Function}>}
 */
export const COLLECTIONS = Object.freeze([
  {
    key: "characterSkills",
    name: "Character Skills",
    scope: SCOPE.CHARACTER,
    esiScope: "esi-skills.read_skills.v1",
    phase: PHASE.FIRST_PAINT,
    group: characterSkillsQueryGroup,
    query: characterSkillsQuery,
  },
  {
    key: "characterBlueprints",
    name: "Character Blueprints",
    scope: SCOPE.CHARACTER,
    esiScope: "esi-characters.read_blueprints.v1",
    phase: PHASE.FIRST_PAINT,
    group: characterBlueprintsQueryGroup,
    query: characterBlueprintsQuery,
  },
  {
    key: "characterIndustryJobs",
    name: "Character Industry Jobs",
    scope: SCOPE.CHARACTER,
    esiScope: "esi-industry.read_character_jobs.v1",
    phase: PHASE.FIRST_PAINT,
    group: characterIndustryJobsQueryGroup,
    query: characterIndustryJobsQuery,
  },
  {
    key: "corporationBlueprints",
    name: "Corporation Blueprints",
    scope: SCOPE.CORPORATION,
    esiScope: "esi-corporations.read_blueprints.v1",
    phase: PHASE.FIRST_PAINT,
    group: corporationBlueprintsQueryGroup,
    query: corporationBlueprintsQuery,
  },
  {
    key: "corporationIndustryJobs",
    name: "Corporation Industry Jobs",
    scope: SCOPE.CORPORATION,
    esiScope: "esi-industry.read_corporation_jobs.v1",
    phase: PHASE.FIRST_PAINT,
    group: corporationIndustryJobsQueryGroup,
    query: corporationIndustryJobsQuery,
  },
  {
    key: "characterStandings",
    name: "Character Standings",
    scope: SCOPE.CHARACTER,
    esiScope: "esi-characters.read_standings.v1",
    phase: PHASE.DEFERRED,
    group: characterStandingsQueryGroup,
    query: characterStandingsQuery,
  },
  {
    key: "characterMarketOrders",
    name: "Character Market Orders",
    scope: SCOPE.CHARACTER,
    esiScope: "esi-markets.read_character_orders.v1",
    phase: PHASE.DEFERRED,
    group: characterMarketOrdersQueryGroup,
    query: characterMarketOrdersQuery,
  },
  {
    key: "characterHistoricMarketOrders",
    name: "Character Historic Market Orders",
    scope: SCOPE.CHARACTER,
    esiScope: "esi-markets.read_character_orders.v1",
    phase: PHASE.DEFERRED,
    group: characterHistoricMarketOrdersQueryGroup,
    query: characterHistoricMarketOrdersQuery,
  },
  {
    key: "characterJournal",
    name: "Character Journal",
    scope: SCOPE.CHARACTER,
    esiScope: "esi-wallet.read_character_wallet.v1",
    phase: PHASE.DEFERRED,
    group: characterJournalQueryGroup,
    query: characterJournalQuery,
  },
  {
    key: "characterTransactions",
    name: "Character Transactions",
    scope: SCOPE.CHARACTER,
    esiScope: "esi-wallet.read_character_wallet.v1",
    phase: PHASE.DEFERRED,
    group: characterTransactionsQueryGroup,
    query: characterTransactionsQuery,
  },
  {
    key: "corporationMarketOrders",
    name: "Corporation Market Orders",
    scope: SCOPE.CORPORATION,
    esiScope: "esi-markets.read_corporation_orders.v1",
    phase: PHASE.DEFERRED,
    group: corporationMarketOrdersQueryGroup,
    query: corporationMarketOrdersQuery,
  },
  {
    key: "corporationHistoricMarketOrders",
    name: "Corporation Historic Market Orders",
    scope: SCOPE.CORPORATION,
    esiScope: "esi-markets.read_corporation_orders.v1",
    phase: PHASE.DEFERRED,
    group: corporationHistoricMarketOrdersQueryGroup,
    query: corporationHistoricMarketOrdersQuery,
  },
  {
    key: "corporationJournal",
    name: "Corporation Journal",
    scope: SCOPE.CORPORATION_DIVISION,
    esiScope: "esi-wallet.read_corporation_wallets.v1",
    phase: PHASE.DEFERRED,
    group: corporationJournalQueryGroup,
    query: corporationJournalQuery,
  },
  {
    key: "corporationTransactions",
    name: "Corporation Transactions",
    scope: SCOPE.CORPORATION_DIVISION,
    esiScope: "esi-wallet.read_corporation_wallets.v1",
    phase: PHASE.DEFERRED,
    group: corporationTransactionsQueryGroup,
    query: corporationTransactionsQuery,
  },
  {
    key: "characterAssets",
    name: "Character Assets",
    scope: SCOPE.CHARACTER,
    esiScope: "esi-assets.read_assets.v1",
    phase: PHASE.ON_DEMAND,
    group: characterAssetsQueryGroup,
    query: characterAssetsQuery,
  },
  {
    // Per character, unlike every other corporation collection: ESI limits a corporation's asset
    // list to what the asking character has the office and container access to see, so one
    // member's answer is not the corporation's.
    key: "corporationAssets",
    name: "Corporation Assets",
    scope: SCOPE.CHARACTER,
    esiScope: "esi-assets.read_corporation_assets.v1",
    phase: PHASE.ON_DEMAND,
    group: corporationAssetsQueryGroup,
    query: corporationAssetsQuery,
  },
]);

/** Phases the scheduler walks, in order. */
export const PREFETCHED_PHASES = Object.freeze([
  PHASE.FIRST_PAINT,
  PHASE.DEFERRED,
]);
