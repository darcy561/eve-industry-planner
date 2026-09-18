/**
 * Why the application asks to share citadel names.
 *
 * The facts are held once and the surfaces compose them, because the Accounts page and the
 * first-login step each carried their own wording of this and the two had already drifted apart.
 */

/** The constraint everything else follows from. */
const WHY_NAMES_ARE_HIDDEN =
  "A citadel's name is only readable through ESI by a character with docking access to it";

/**
 * What the application does with what it is given — the fact a reader deciding whether to share
 * actually weighs.
 */
export const CITADEL_NAMES_PRIVACY =
  "Names are stored anonymously and are not linked to your account, and every ESI query is made with your own character's token in your browser.";

/** First login, which leads with the explanation rather than with the switch. */
export const SHARE_CITADEL_NAMES_EXPLANATION = `${WHY_NAMES_ARE_HIDDEN}, so the application gathers names from community submissions to fill the gaps in your asset lists. ${CITADEL_NAMES_PRIVACY} Turn the switch off to stop sharing and stop using community data.`;

/**
 * What the setting a reader is on costs them, stated for the state they are in rather than for
 * both at once. Kept here with the rest: these say the same things the explanation says, and the
 * drift this file exists to stop starts with a sentence written a second time somewhere else.
 */
export const CITADEL_NAMES_WHILE_SHARING =
  "Turning this off stops your names being shared, and stops community names filling the gaps in your asset lists.";
export const CITADEL_NAMES_WHILE_NOT_SHARING =
  "While this is off, structures no character of yours can dock at are shown as unreadable in your asset lists.";

/** The Accounts page, where the switch leads and this says what it trades. */
export const SHARE_CITADEL_NAMES_SUMMARY = `${WHY_NAMES_ARE_HIDDEN}. Share the names your characters can read, and read the ones other players have shared.`;
