import { fetchPlannerJobDocumentsFromApi } from "../../Functions/Endpoints/Pirivate/jobDocuments.js";
import {
  emitLoginError,
  emitLoginStepComplete,
  LOGIN_STEPS,
} from "../../Events/loginEvents.js";

/**
 * Fetches planner job documents from the API into `jobArray`.
 * Emits `LOGIN_STEPS.JOB_PLANNER` when done.
 */
export async function bootstrapJobDocumentsLoginStep() {
  try {
    await fetchPlannerJobDocumentsFromApi();
    emitLoginStepComplete(LOGIN_STEPS.JOB_PLANNER);
  } catch (err) {
    emitLoginError(LOGIN_STEPS.JOB_PLANNER, err);
    console.error(err);
  }
}
