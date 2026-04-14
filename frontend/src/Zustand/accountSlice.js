/**
 * Account slice for Zustand — Mongo `users` document and auth/login flags.
 * Kept separate from application settings.
 *
 * @fileoverview Root slice wrapper for `account` store key
 */

import { accountStateDefault, accountActions } from "./account";

const accountSlice = (set, get) => ({
  account: {
    ...accountStateDefault(),
    actions: accountActions(set, get),
  },
});

export default accountSlice;
