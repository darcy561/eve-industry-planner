/**
 * Global Configuration Constants for EVE Industry Planner Firebase Cloud Functions.
 * 
 * This file contains all the default configuration values used throughout the Firebase Cloud Functions.
 * Incorrect values here will result in errors when deployed. All constants are exported for use
 * across different function modules and provide centralized configuration management.
 * 
 * @fileoverview Global configuration constants for EVE Industry Planner Firebase Functions
 * @author EVE Industry Planner Team
 */

/**
 * Firebase Cloud Functions deployment region.
 * 
 * Specifies the Google Cloud region where Firebase Cloud Functions are deployed.
 * This affects latency and data residency requirements.
 * 
 * @type {string}
 * @default "europe-west1"
 */
export const FIREBASE_SERVER_REGION = "europe-west1";

/**
 * Firebase Cloud Functions timezone configuration.
 * 
 * Specifies the timezone used for scheduled functions and time-based operations.
 * Uses GMT as the reference timezone for consistency across regions.
 * 
 * @type {string}
 * @default "Etc/GMT"
 */
export const FIREBASE_SERVER_TIMEZONE = "Etc/GMT";

/**
 * Application version number for compatibility checking.
 * 
 * This version must match the app version found in the package.json file of the web application.
 * Used by middleware to verify client compatibility and enforce version requirements.
 * 
 * @type {string}
 * @default "0.8.03"
 */
export const APP_VERSION = "0.8.03";

/**
 * Default market locations for EVE Online market data.
 * 
 * Defines the primary market hubs used for price data collection and display.
 * These locations must be publicly accessible - private markets in citadels cannot be used.
 * Each location includes a name, region ID, and station ID for ESI API queries.
 * 
 * @type {Array<Object>}
 * @property {string} name - Human-readable location name (e.g., "jita")
 * @property {number} regionID - EVE Online region ID
 * @property {number} stationID - EVE Online station ID
 * 
 * @example
 * [
 *   { name: "jita", regionID: 10000002, stationID: 60003760 },
 *   { name: "amarr", regionID: 10000043, stationID: 60008494 }
 * ]
 */
export const DEFAULT_MARKET_LOCATIONS = [
  { name: "jita", regionID: 10000002, stationID: 60003760 },
  { name: "amarr", regionID: 10000043, stationID: 60008494 },
  { name: "dodixie", regionID: 10000032, stationID: 60011866 },
  { name: "hek", regionID: 10000042, stationID: 60005686 },
];

/**
 * Market data refresh period in hours.
 * 
 * Defines how often market price data is refreshed from the ESI API.
 * Items with data older than this period will be queued for refresh.
 * 
 * @type {number}
 * @default 4
 * @unit hours
 */
export const DEFAULT_ITEM_PRICE_REFRESH_PERIOD = 4;

/**
 * Market data batch refresh quantity.
 * 
 * Defines how many items are processed in each batch when refreshing market data.
 * Larger batches are more efficient but may hit rate limits faster.
 * 
 * @type {number}
 * @default 50
 */
export const DEFAULT_ITEM_MARKET_REFRESH_QUANTITY = 50;

/**
 * Market history refresh period in hours.
 * 
 * Defines how often market history data is refreshed from the ESI API.
 * Items with history data older than this period will be queued for refresh.
 * 
 * @type {number}
 * @default 4
 * @unit hours
 */
export const DEFAULT_ITEM_HISTROY_REFRESH_PERIOD = 4;

/**
 * Market history batch refresh quantity.
 * 
 * Defines how many items are processed in each batch when refreshing market history data.
 * Larger batches are more efficient but may hit rate limits faster.
 * 
 * @type {number}
 * @default 50
 */
export const DEFAULT_ITEM_MARKET_HISTORY_REFRESH_QUANTITY = 50;

/**
 * Market history calculation period in days.
 * 
 * Defines the time window for market history calculations and analysis.
 * Used for determining price trends and historical data relevance.
 * 
 * @type {number}
 * @default 30
 * @unit days
 */
export const DEFAULT_DAYS_FOR_MARKET_HISTORY = 30;

/**
 * Default cloud accounts setting for new users.
 * 
 * Determines whether new user accounts have cloud character saving enabled by default.
 * When true, character data is automatically synced to cloud storage.
 * 
 * @type {boolean}
 * @default false
 */
export const DEFAULT_CLOUD_ACCOUNTS = false;

/**
 * Default market location for new users.
 * 
 * Specifies the primary market location used by default for new user accounts.
 * Must match one of the names defined in DEFAULT_MARKET_LOCATIONS.
 * 
 * @type {string}
 * @default "jita"
 */
export const DEFAULT_MARKET_OPTION = "jita";

/**
 * Default order type for new users.
 * 
 * Specifies whether new users see buy orders or sell orders by default.
 * Affects the default view in market data displays and calculations.
 * 
 * @type {string}
 * @default "sell"
 * @enum {string} "buy" | "sell"
 */
export const DEFAULT_ORDER_OPTION = "sell";

/**
 * Default asset location station ID for new users.
 * 
 * Specifies the default station ID where assets are assumed to be located.
 * Used for industry calculations and asset management features.
 * Default is Jita 4-4 (60003760).
 * 
 * @type {number}
 * @default 60003760
 */
export const DEFAULT_ASSET_LOCATION = 60003760;

/**
 * Default citadel broker's fee percentage for new users.
 * 
 * Specifies the default broker's fee percentage used in citadel transactions.
 * Used for cost calculations in industry planning and market operations.
 * 
 * @type {number}
 * @default 1
 * @unit percentage
 */
export const DEFAULT_CITADEL_BROKERS_FEE = 1;

/**
 * Default manufacturing structures for new users.
 * 
 * Specifies the default manufacturing structures available to new users.
 * Used for industry calculations and structure-based cost analysis.
 * 
 * @type {Array<Object>}
 * @default []
 */
export const DEFAULT_MANUFACTURING_STRUCTURES = [];

/**
 * Default reaction structures for new users.
 * 
 * Specifies the default reaction structures available to new users.
 * Used for reaction industry calculations and structure-based cost analysis.
 * 
 * @type {Array<Object>}
 * @default []
 */
export const DEFAULT_REACTION_STRUCTURES = [];

/**
 * Default reprocessing structures for new users.
 * 
 * Specifies the default reprocessing structures available to new users.
 * Used for reprocessing calculations and structure-based efficiency analysis.
 * 
 * @type {Array<Object>}
 * @default []
 */
export const DEFAULT_REPROCESSING_STRUCTURES = [];

/**
 * Maximum number of API server instances.
 * 
 * Defines the maximum number of concurrent Firebase Cloud Function instances
 * that can be created for the API endpoints. Higher values allow more
 * concurrent requests but increase costs.
 * 
 * @type {number}
 * @default 10
 */
export const DEFAULT_API_MAX_SERVER_INSTANCES = 10;

/**
 * API request timeout in seconds.
 * 
 * Defines the maximum time allowed for API requests to complete before timing out.
 * Longer timeouts allow for more complex operations but may impact user experience.
 * 
 * @type {number}
 * @default 120
 * @unit seconds
 */
export const DEFAULT_API_REQUEST_TIMEOUT_SECONDS = 120;

/**
 * Maximum number of API retries.
 * 
 * Defines the maximum number of retry attempts for failed API requests.
 * Used in error handling and resilience patterns for external API calls.
 * 
 * @type {number}
 * @default 3
 */
export const MAX_API_RETRIES = 3;

/**
 * Maximum Cloud Task timeout in seconds.
 * 
 * Defines the maximum execution time allowed for Cloud Tasks before timing out.
 * Used for long-running background processes and batch operations.
 * 
 * @type {number}
 * @default 540
 * @unit seconds
 */
export const MAX_CLOUD_TASK_TIMEOUT_SECONDS = 540;
