import { fetchJobGroupsFromApi } from "../../Functions/Endpoints/Pirivate/groups";
import {
  emitLoginError,
  emitLoginStepComplete,
  LOGIN_STEPS,
} from "../../Events/loginEvents";

/**
 * Fetches job groups from the API. Emits `LOGIN_STEPS.GROUP_DATA` when done.
 * Call without `await` from the login path to run in parallel with other bootstrap steps.
 */
export async function bootstrapJobGroupsLoginStep() {
  try {
    await fetchJobGroupsFromApi();
    emitLoginStepComplete(LOGIN_STEPS.GROUP_DATA);
  } catch (err) {
    emitLoginError(LOGIN_STEPS.GROUP_DATA, err);
    console.error(err);
  }
}
