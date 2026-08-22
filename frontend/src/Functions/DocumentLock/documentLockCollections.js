/**
 * Mongo logical collection names for {@link ../../Hooks/useDocumentLock.js} + Redis locks.
 * Must match `services/shared/core/mongo` and `subscribe_auth` on the websocket service.
 */
export { USER_JOB_GROUPS_COLLECTION } from "../Endpoints/Pirivate/groups.js";

/** Live planner jobs — Mongo `account_job_documents`; pair with `useDocumentLock(USER_JOBS_COLLECTION, jobID, enabled)`. */
export const USER_JOBS_COLLECTION = "account_job_documents";
