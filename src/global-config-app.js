// This document changes the default behaviour of the application. Incorect values here will result in errors when deployed.

const GLOBAL_CONFIG = {
  //Firebase function deployment region, this must match what is specified within the functions global config.
  FIREBASE_FUNCTION_REGION: "europe-west1",

  PRIMARY_THEME: "dark",
  SECONDARY_THEME: "light",

  // Number of previous days ESI data will be retrieved for.
  //(Number)
  //Default: 14
  ESI_DATE_PERIOD: 14,

  // Max number of ESI pages to query.
  //(Number)
  //Default: 50
  ESI_MAX_PAGES: 50,

  //Matches the shortest refresh period defined for the market prices or market history in the functions config file.
  //(Number)
  //Default: 4
  DEFAULT_ITEM_REFRESH_PERIOD: 4,

  //Number of hours that archived job information is stored on the app before being refreshed.
  //(Number)
  //Default: 1
  DEFAULT_ARCHIVE_REFRESH_PERIOD: 1,

  //Market options, these must match the options added into the functions config file.
  //The "id" field must match the name specified, the "name" field is what will be displayed on the front end of the app.
  //(Object Array)
  MARKET_OPTIONS: [
    { id: "amarr", name: "Amarr", stationID: 60008494, regionID: 10000043 },
    { id: "dodixie", name: "Dodixie", stationID: 60011866, regionID: 10000032 },
    { id: "jita", name: "Jita", stationID: 60003760, regionID: 10000002 },
  ],
  //Default market location.
  //(String)
  //Default: "jita"
  //If using a custom location, this must match the defined name.
  DEFAULT_MARKET_OPTION: "jita",

  //Default order type.
  //(String)
  //Default: "sell"
  //Options: "buy", "sell"
  DEFAULT_ORDER_OPTION: "sell",

  //Default asset location station id.
  //(Number)
  //Default: 60003760 (Jita 4-4)
  DEFAULT_ASSET_LOCATION: 60003760,

  //Default system id.
  //(Number)
  //Default 30000142 (Jita)
  DEFAULT_SYSTEM: 30000142,

  //Default region id
  //(Number)
  //Default 10000002 (The Forge)
  DEFAULT_REGION: 10000002,

  //Shows/Hides the feedback icon from the bottom right hand corner of the app.
  //(Boolean)
  //Default: true
  ENABLE_FEEDBACK_ICON: true,
};

export default GLOBAL_CONFIG;
