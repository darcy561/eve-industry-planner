/**
 * Allowlisted event keys for POST /api/v1/analytics/events batch items (snake_case).
 * Prefer backend OTel (jobs, archived-jobs, auth/login, etc.) when the same action hits the API.
 * Keep in sync with allowedFrontendAnalyticsEvents in services/api/v1endpoints/frontend_analytics.go
 */
export const AppEvent = Object.freeze({
  NEW_JOB: "new_job",
  BUILD_SHOPPING_LIST: "build_shopping_list",
  ADD_CUSTOM_STRUCTURE: "add_custom_structure",
  REPROCESSING_CALCULATION_TO_MINERALS: "reprocessing_calculation_to_minerals",
  REPROCESSING_CALCULATION_FROM_MINERALS: "reprocessing_calculation_from_minerals",
  VIEW_ARCHIVED_JOB_DATA: "view_archived_job_data",
  ADD_ADDITIONAL_CHARACTER_CLOUD: "add_additional_character_cloud",
  ADD_ADDITIONAL_CHARACTER_LOCAL: "add_additional_character_local",
  NEW_WATCHLIST_GROUP: "new_watchlist_group",
  NEW_JOB_GROUP: "new_job_group",
  REMOVE_WATCHLIST_ITEM: "remove_watchlist_item",
  NEW_WATCHLIST_ITEM: "new_watchlist_item",
});
