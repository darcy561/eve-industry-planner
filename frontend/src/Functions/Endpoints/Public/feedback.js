import { fetchWithPublicHeaders } from "./applyPublicHeaders.js";
import { MAX_FEEDBACK_LENGTH } from "./apiLimits.js";
import useUserStore from "../../../Zustand/usersStore";

/**
 * Submits feedback to the API endpoint.
 * Uses POST request to send feedback content in the request body.
 * Automatically applies public headers (X-User-Agent).
 * Optionally includes JWT token in Authorization header if user is logged in.
 *
 * Retries: `fetchWithPublicHeaders` (408 / 429 / 5xx). Optional Bearer is only used to label feedback; invalid JWT does not fail the handler. See `FeedbackHandler` in `services/api/v1endpoints/feedback.go` (400/405/500).
 * 
 * @param {string} feedbackContent - The sanitized feedback content to submit
 * @returns {Promise<boolean>} Promise that resolves to true if successful, false otherwise
 * 
 * @example
 * const success = await submitFeedback("This is great!");
 * if (success) {
 *   console.log("Feedback submitted successfully");
 * }
 */
async function submitFeedback(feedbackContent) {
  if (!feedbackContent || typeof feedbackContent !== 'string' || feedbackContent.trim().length === 0) {
    console.error("Feedback content is required");
    return false;
  }
  if (feedbackContent.length > MAX_FEEDBACK_LENGTH) {
    console.error(
      "Feedback content too long:",
      feedbackContent.length,
      "max",
      MAX_FEEDBACK_LENGTH
    );
    return false;
  }

  // Get JWT token if user is logged in
  let serverToken = null;
  try {
    serverToken = useUserStore.getState().account.actions.getServerAccessToken();
  } catch (error) {
    // User not logged in or error getting token - continue without token
    console.debug("No server token available, submitting as logged out user");
  }

  const URL = `/api/v1/feedback`;

  try {
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ response: feedbackContent.trim() }),
    };

    // Add Authorization header with JWT token if available
    if (serverToken) {
      options.headers["Authorization"] = `Bearer ${serverToken}`;
    }

    const response = await fetchWithPublicHeaders(URL, options, {
      requestName: "submitFeedback",
    });

    if (!response.ok) {
      console.error("Failed to submit feedback:", response.status, response.statusText);
      return false;
    }

    // Success - endpoint returns 200 OK with no body
    return true;
  } catch (error) {
    console.error("Error submitting feedback:", error);
    return false;
  }
}

export default submitFeedback;
