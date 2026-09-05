/**
 * Allowlisted event keys for POST /api/v1/analytics/events batch items (snake_case).
 * Prefer backend OTel (jobs, archived-jobs, auth/login, etc.) when the same action hits the API.
 * Keep in sync with allowedFrontendAnalyticsEvents in services/api/v1endpoints/frontendAnalytics.go
 */
export const AppEvent = Object.freeze({
  NEW_JOB: "new_job",
  VIEW_JOB_TREE_DIALOGUE: "view_job_tree_dialogue",
  VIEW_ITEM_TREE_ITEM: "view_item_tree_item",
  GROUP_TAB_PLANNER: "group_tab_planner",
  GROUP_TAB_JOB_TREE: "group_tab_job_tree",
  GROUP_TAB_BREAKDOWN: "group_tab_breakdown",
  GROUP_TAB_SCHEDULER: "group_tab_scheduler",
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
  GROUP_TEMPLATE_ADD: "group_template_add",
  GROUP_TEMPLATE_DELETE: "group_template_delete",
  GROUP_TEMPLATE_REPLACE: "group_template_replace",
  GROUP_TEMPLATE_APPLY: "group_template_apply",
});
