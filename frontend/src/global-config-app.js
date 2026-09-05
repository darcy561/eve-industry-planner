/**
 * Client-side defaults for the application. A wrong value here surfaces as an
 * error once deployed.
 *
 * @type {Object}
 * @readonly
 * @frozen
 */
const GLOBAL_CONFIG = Object.freeze({
  /**
   * Default Discord invite link.
   *
   * @type {string}
   */
  DEFAULT_DISCORD_INVITE: "https://discord.gg/KGSa8gh37z",

  /**
   * Default GitHub repository link.
   *
   * @type {string}
   */
  DEFAULT_GITHUB_LINK: "https://github.com/darcy561/Eve-Industry-Planner-React",

  /**
   * EVE forum thread URL for help/news.
   *
   * @type {string}
   */
  DEFAULT_EVE_FORUM_THREAD_LINK: "https://forums.eveonline.com/t/eve-industry-planner-industry-job-management-application-v0-8-0-resource-reprocessing",

  /**
   * In-game channel name for support.
   *
   * @type {string}
   */
  DEFAULT_INGAME_SUPPORT_CHANNEL: "EVE Industry Planner",

  /**
   * In-game mail contact character name for support.
   *
   * @type {string}
   */
  DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER: "Reginal Shardani",

  /**
   * Primary application theme.
   *
   * @type {string}
   */
  PRIMARY_THEME: "dark",

  /**
   * Secondary application theme.
   *
   * @type {string}
   */
  SECONDARY_THEME: "light",

  /**
   * ESI data retrieval period in days.
   *
   * @type {number}
   * @unit days
   */
  ESI_DATE_PERIOD: 14,

  /**
   * ESI X-Compatibility-Date (YYYY-MM-DD). Single pin for all browser ESI calls.
   * Keep in sync with Go `worker/esi` package `CompatibilityDate` (compatibility_date.go) when bumping.
   *
   * @type {string}
   */
  ESI_COMPATIBILITY_DATE: "2025-12-16",

  /**
   * Default item refresh period in hours.
   *
   * Matches the shortest refresh period defined for market prices or market history
   * in the functions config file. Used for client-side refresh timing.
   *
   * @type {number}
   * @unit hours
   */
  DEFAULT_ITEM_REFRESH_PERIOD: 4,

  /**
   * System index refresh period in hours.
   *
   * @type {number}
   * @unit hours
   */
  DEFAULT_SYSTEMINDEX_REFRESH_PERIOD: 1,

  /**
   * Archived job refresh period in hours.
   *
   * @type {number}
   * @unit hours
   */
  DEFAULT_ARCHIVE_REFRESH_PERIOD: 1,

  /**
   * Available market options for EVE Online trading hubs. Each entry must match
   * a market defined in the functions config file.
   *
   * @type {Array<Object>}
   * @property {string} id - Unique identifier matching functions config
   * @property {string} name - Display name shown in the UI
   * @property {number} stationID - EVE Online station ID
   * @property {number} regionID - EVE Online region ID
   */
  MARKET_OPTIONS: [
    { id: "amarr", name: "Amarr", stationID: 60008494, regionID: 10000043 },
    { id: "dodixie", name: "Dodixie", stationID: 60011866, regionID: 10000032 },
    { id: "hek", name: "Hek", stationID: 60005686, regionID: 10000042 },
    { id: "jita", name: "Jita", stationID: 60003760, regionID: 10000002 },
  ],

  /**
   * Default market location for new users.
   *
   * @type {string}
   */
  DEFAULT_MARKET_OPTION: "jita",

  /**
   * Default order type for new users.
   *
   * @type {string}
   * @enum {string} "buy" | "sell"
   */
  DEFAULT_ORDER_OPTION: "sell",

  /**
   * Default asset location station ID for new users.
   *
   * @type {number}
   */
  DEFAULT_ASSET_LOCATION: 60003760,

  /**
   * Default solar system ID for new users.
   *
   * @type {number}
   */
  DEFAULT_SYSTEM: 30000142,

  /**
   * Default region ID for new users.
   *
   * @type {number}
   */
  DEFAULT_REGION: 10000002,

  /**
   * Enable feedback icon display.
   *
   * Controls whether the feedback icon is shown in the bottom right corner
   * of the application for user feedback collection.
   *
   * @type {boolean}
   */
  ENABLE_FEEDBACK_ICON: true,

  /**
   * ESI: target time (minutes) to complete one full round-robin over all
   * characters. Per-tick delay = `this × 60 / n` (clamped by min/max), so
   * more toons get shorter gaps between steps and a full pass still fits
   * under ~EVE 20m access + 15m in-code buffer.
   *
   * @type {number}
   * @unit minutes
   */
  ESI_STAGGER_TARGET_FULL_CYCLE_MINUTES: 10,

  /**
   * ESI: floor (seconds) for stagger tick — avoid hammering the token endpoint
   * when the account has many characters.
   *
   * @type {number}
   * @unit seconds
   */
  ESI_STAGGER_TICK_MIN_SECONDS: 20,

  /**
   * ESI: ceiling (seconds) for stagger tick — a solo or small account does not
   * need to wait a full `TARGET` between checks on a single character.
   *
   * @type {number}
   * @unit seconds
   */
  ESI_STAGGER_TICK_MAX_SECONDS: 180,

  /**
   * Default character refresh interval in minutes.
   *
   * How often to run non-ESI maintenance: corporation claims sync and app JWT
   * refresh, after staggered ESI has kept per-character access tokens current.
   * ESI is **not** bulk-refreshed on this tick (staggered rotation handles that).
   *
   * @type {number}
   * @unit minutes
   */
  DEFAULT_CHARACTER_REFRESH_INTERVAL: 15,

  /**
   * Minimum gap between redundant `POST .../auth/sessions/rotate` calls when the
   * planner session is already valid (throttles pre-flight refresh before private API).
   * Align with typical EVE SSO **access** JWT lifetime (~20m); login/bootstrap still
   * sets `lastPlannerSessionValidatedAt` on the account slice immediately.
   *
   * @type {number}
   * @unit minutes
   */
  PLANNER_SESSION_ROTATE_COOLDOWN_MINUTES: 20,

  /**
   * Default app version check interval in minutes.
   *
   * @type {number}
   * @unit minutes
   */
  DEFAULT_APP_VERSION_CHECK_INTERVAL: 30,

  /**
   * Default locale for number formatting.
   *
   * @type {string}
   */
  DEFAULT_LOCALE: "en-US",
});

/**
 * Exports the global configuration object.
 *
 * This frozen configuration object provides centralised settings management
 * for the EVE Industry Planner React application.
 *
 * @type {Object}
 * @readonly
 * @frozen
 */
export default GLOBAL_CONFIG;
