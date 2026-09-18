import { useSyncExternalStore } from "react";
import {
  credentialHealth,
  subscribeToCredentialHealth,
} from "../../../Functions/Auth/esiCredentials/health.js";

/**
 * Whether the application can currently use a character's ESI credentials.
 *
 * The record lives outside React because the provider writes it from wherever a token is acquired;
 * this reads it.
 *
 * @param {string} characterHash
 * @returns {{state: string, at: number}} see `CREDENTIAL_HEALTH`
 */
export function useCredentialHealth(characterHash) {
  return useSyncExternalStore(subscribeToCredentialHealth, () =>
    credentialHealth(characterHash),
  );
}
