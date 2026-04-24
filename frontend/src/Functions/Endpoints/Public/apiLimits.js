/** Matches `maxSystemIDs` / `maxTypeIDs` in services/api/v1endpoints. */
export const MAX_BATCH_SYSTEM_OR_TYPE_IDS = 500;

/** Matches `MaxFeedbackLength` in services/api/v1endpoints/feedback.go */
export const MAX_FEEDBACK_LENGTH = 5000;

/** Matches `maxFrontendEventCount` in services/api/v1endpoints/frontend_analytics.go */
export const MAX_FRONTEND_ANALYTICS_EVENT_COUNT = 1000;

/** Matches `maxFrontendByTypeKeys` in services/api/v1endpoints/frontend_analytics.go (new_job by_type map). */
export const MAX_FRONTEND_ANALYTICS_BY_TYPE_KEYS = 500;

/** Matches `maxFrontendBatchEvents` in services/api/v1endpoints/frontend_analytics.go */
export const MAX_FRONTEND_ANALYTICS_BATCH_EVENTS = 60;
