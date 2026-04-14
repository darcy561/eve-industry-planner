/**
 * Global Configuration Constants for EVE Industry Planner React Application.
 * 
 * This file contains all the default configuration values used throughout the React application.
 * Incorrect values here will result in errors when deployed. All constants are frozen to prevent
 * accidental modification and provide centralized configuration management for the client-side application.
 * 
 * @fileoverview Global configuration constants for EVE Industry Planner React Application
 * @author EVE Industry Planner Team
 */

// This document changes the default behaviour of the application. Incorect values here will result in errors when deployed.

/**
 * Global configuration object containing all application settings.
 * 
 * This frozen object provides centralized configuration management for the React application.
 * All values are immutable to prevent accidental modification during runtime.
 * 
 * @type {Object}
 * @readonly
 * @frozen
 */
const GLOBAL_CONFIG = Object.freeze({

  /**
   * Default Discord invite link.
   * 
   * Provides the Discord server invite link for community support
   * and user communication.
   * 
   * @type {string}
   * @default "https://discord.gg/KGSa8gh37z"
   */
  DEFAULT_DISCORD_INVITE: "https://discord.gg/KGSa8gh37z",

  /**
   * Default GitHub repository link.
   * 
   * Provides the GitHub repository link for source code access,
   * issue reporting, and community contributions.
   * 
   * @type {string}
   * @default "https://github.com/darcy561/Eve-Industry-Planner-React"
   */
  DEFAULT_GITHUB_LINK: "https://github.com/darcy561/Eve-Industry-Planner-React",

  //Firebase function deployment region, this must match what is specified within the functions global config.

  /**
   * Firebase Cloud Functions deployment region.
   * 
   * Specifies the Google Cloud region where Firebase Cloud Functions are deployed.
   * This must match the region specified in the functions global config file.
   * 
   * @type {string}
   * @default "europe-west1"
   */
  FIREBASE_FUNCTION_REGION: "europe-west1",

  /**
   * Primary application theme.
   * 
   * Specifies the default theme used throughout the application.
   * Used for consistent styling and user interface appearance.
   * 
   * @type {string}
   * @default "dark"
   */
  PRIMARY_THEME: "dark",

  /**
   * Secondary application theme.
   * 
   * Specifies the alternative theme available for user switching.
   * Used for theme toggle functionality and user preferences.
   * 
   * @type {string}
   * @default "light"
   */
  SECONDARY_THEME: "light",

  // Number of previous days ESI data will be retrieved for.
  //(Number)
  //Default: 14

  /**
   * ESI data retrieval period in days.
   * 
   * Defines how many previous days of EVE Online ESI data will be retrieved
   * for historical analysis and trend calculations.
   * 
   * @type {number}
   * @default 14
   * @unit days
   */
  ESI_DATE_PERIOD: 14,

  // Max number of ESI pages to query.
  //(Number)
  //Default: 50

  /**
   * Maximum ESI API pages to query.
   * 
   * Defines the maximum number of pages to retrieve from ESI API endpoints
   * to prevent excessive API usage and improve performance.
   * 
   * @type {number}
   * @default 50
   */
  ESI_MAX_PAGES: 50,

  //Matches the shortest refresh period defined for the market prices or market history in the functions config file.
  //(Number)
  //Default: 4

  /**
   * Default item refresh period in hours.
   * 
   * Matches the shortest refresh period defined for market prices or market history
   * in the functions config file. Used for client-side refresh timing.
   * 
   * @type {number}
   * @default 4
   * @unit hours
   */
  DEFAULT_ITEM_REFRESH_PERIOD: 4,

  //Age of system index before an update is requested.
  //(Number)
  //Default: 1

  /**
   * System index refresh period in hours.
   * 
   * Defines how old system index data can be before requesting an update.
   * Used for industry cost calculations and system efficiency analysis.
   * 
   * @type {number}
   * @default 1
   * @unit hours
   */
  DEFAULT_SYSTEMINDEX_REFRESH_PERIOD: 1,

  //Number of hours that archived job information is stored on the app before being refreshed.
  //(Number)
  //Default: 1

  /**
   * Archived job refresh period in hours.
   * 
   * Defines how long archived job information is stored on the app
   * before being refreshed from the server.
   * 
   * @type {number}
   * @default 1
   * @unit hours
   */
  DEFAULT_ARCHIVE_REFRESH_PERIOD: 1,

  //Market options, these must match the options added into the functions config file.
  //The "id" field must match the name specified, the "name" field is what will be displayed on the front end of the app.
  //(Object Array)

  /**
   * Available market options for EVE Online trading hubs.
   * 
   * Defines the market locations available for price data and trading operations.
   * These must match the options defined in the functions config file.
   * The "id" field must match the name specified, the "name" field is displayed in the UI.
   * 
   * @type {Array<Object>}
   * @property {string} id - Unique identifier matching functions config
   * @property {string} name - Display name shown in the UI
   * @property {number} stationID - EVE Online station ID
   * @property {number} regionID - EVE Online region ID
   * 
   * @example
   * [
   *   { id: "jita", name: "Jita", stationID: 60003760, regionID: 10000002 },
   *   { id: "amarr", name: "Amarr", stationID: 60008494, regionID: 10000043 }
   * ]
   */
  MARKET_OPTIONS: [
    { id: "amarr", name: "Amarr", stationID: 60008494, regionID: 10000043 },
    { id: "dodixie", name: "Dodixie", stationID: 60011866, regionID: 10000032 },
    { id: "hek", name: "Hek", stationID: 60005686, regionID: 10000042 },
    { id: "jita", name: "Jita", stationID: 60003760, regionID: 10000002 },
  ],

  //Default market location.
  //(String)
  //Default: "jita"
  //If using a custom location, this must match the defined id.

  /**
   * Default market location for new users.
   * 
   * Specifies the primary market location used by default for new user accounts.
   * Must match one of the IDs defined in MARKET_OPTIONS.
   * 
   * @type {string}
   * @default "jita"
   */
  DEFAULT_MARKET_OPTION: "jita",

  //Default order type.
  //(String)
  //Default: "sell"
  //Options: "buy", "sell"

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
  DEFAULT_ORDER_OPTION: "sell",

  //Default asset location station id.
  //(Number)
  //Default: 60003760 (Jita 4-4)

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
  DEFAULT_ASSET_LOCATION: 60003760,

  //Default system id.
  //(Number)
  //Default 30000142 (Jita)

  /**
   * Default solar system ID for new users.
   * 
   * Specifies the default solar system used for industry calculations
   * and system-based operations. Default is Jita (30000142).
   * 
   * @type {number}
   * @default 30000142
   */
  DEFAULT_SYSTEM: 30000142,

  //Default region id
  //(Number)
  //Default 10000002 (The Forge)

  /**
   * Default region ID for new users.
   * 
   * Specifies the default region used for market data and regional operations.
   * Default is The Forge (10000002).
   * 
   * @type {number}
   * @default 10000002
   */
  DEFAULT_REGION: 10000002,

  //Shows/Hides the feedback icon from the bottom right hand corner of the app.
  //(Boolean)
  //Default: true

  /**
   * Enable feedback icon display.
   * 
   * Controls whether the feedback icon is shown in the bottom right corner
   * of the application for user feedback collection.
   * 
   * @type {boolean}
   * @default true
   */
  ENABLE_FEEDBACK_ICON: true,

  //Disable service worker
  //(Boolean)
  //Default: false

  /**
   * Disable service worker functionality.
   * 
   * Controls whether the service worker is disabled for offline functionality
   * and background processing capabilities.
   * 
   * @type {boolean}
   * @default false
   */
  DISABLE_SERVICE_WORKER: false,

  //Default auto refresh interval in minutes
  //(Number)
  //Default: 30

  /**
   * Default auto refresh interval in minutes.
   * 
   * Defines how often the application automatically refreshes data
   * from the server to keep information current.
   * 
   * @type {number}
   * @default 30
   * @unit minutes
   */
  DEFAULT_AUTO_REFRESH_INTERVAL: 30,

  //Default character refresh interval in minutes
  //(Number)
  //Default: 15

  /**
   * Default character refresh interval in minutes.
   * 
   * Defines how often character data is refreshed from EVE Online ESI API
   * to keep character information and skills current.
   * 
   * @type {number}
   * @default 15
   * @unit minutes
   */
  DEFAULT_CHARACTER_REFRESH_INTERVAL: 15,

  //Default discord invite link
  //(String)
  //Default: "https://discord.gg/KGSa8gh37z"

  /**
   * Default Discord invite link.
   * 
   * Provides the Discord server invite link for community support
   * and user communication.
   * 
   * @type {string}
   * @default "https://discord.gg/KGSa8gh37z"
   */
  DEFAULT_DISCORD_INVITE: "https://discord.gg/KGSa8gh37z",

  //Default github link
  //(String)
  //Default: "https://github.com/darcy561/Eve-Industry-Planner-React"

  /**
   * Default GitHub repository link.
   * 
   * Provides the GitHub repository link for source code access,
   * issue reporting, and community contributions.
   * 
   * @type {string}
   * @default "https://github.com/darcy561/Eve-Industry-Planner-React"
   */
  DEFAULT_GITHUB_LINK: "https://github.com/darcy561/Eve-Industry-Planner-React",

  //Default version check interval in minutes
  //(Number)
  //Default: 30

  /**
   * Default app version check interval in minutes.
   * 
   * Defines how often the application checks for version updates
   * to ensure users are running the latest version.
   * 
   * @type {number}
   * @default 5
   * @unit minutes
   */
  DEFAULT_APP_VERSION_CHECK_INTERVAL: 30,

  //Default locale for number formatting
  //(String)
  //Default: "en-US"

  /**
   * Default locale for number formatting.
   * 
   * Specifies the default locale used for number formatting,
   * currency display, and regional number conventions.
   * 
   * @type {string}
   * @default "en-US"
   */
  DEFAULT_LOCALE: "en-US",
});

/**
 * Exports the global configuration object.
 * 
 * This frozen configuration object provides centralized settings management
 * for the EVE Industry Planner React application.
 * 
 * @type {Object}
 * @readonly
 * @frozen
 */
export default GLOBAL_CONFIG;
