# Accounts

The Accounts page is where you see your login identity, manage linked characters (additional EVE accounts), and control community citadel name sharing. Open it from the main navigation when you are a logged-in user.

The page has three sections, top to bottom:

1. Main Account — read-only summary of the character you signed in with
2. [Community Citadel Names](citadel%20names) — opt in or out of anonymous structure-name sharing
3. Additional Accounts — link extra characters so their ESI data appears alongside your main character

## Main Account

When you log in through EVE SSO, you choose one character as your main character. That login defines your planner account.

The Main Account panel shows:

- Character Name — the EVE character you authenticated with
- Account ID — a stable identifier derived from that character (the same ID is used across devices and sessions)

You cannot change the main character from this page. To use a different main character, sign out and log in again with the other character.

### How main login works (user view)

- First login — You are sent to EVE’s login page, approve the requested scopes, and return to the app. The app creates a planner session (valid for up to seven days before a full EVE login is required again).
- Return visits — Depending on how your account is set up, the app may resume your session from browser cookies (cloud accounts) or from tokens stored in this browser (local accounts), without asking EVE again until the session expires.
- Sign out — Use sign out from the app header. That ends the planner session on the server and clears local session data in the browser.

Your main character’s ESI access is either held in the cloud (encrypted on the server, so you can open the app on another device) or only in this browser. That mode is chosen at login. It is separate from the Store Accounts In Cloud switch below, which only controls additional linked characters—both preferences save to your account and sync across devices.

## Additional Accounts

Additional accounts let you link other EVE characters so the planner can pull their ESI data (assets, industry, wallet, and so on) in the same session as your main character. This is useful for alts, haulers, or corp characters you do not want as the login character.

### What you can do

- Add Account — Opens EVE SSO in a new browser tab. After you authorize, the character is imported, public character and corporation data is loaded, and the character appears in the list.
- Remove — Click the remove control on a linked character. The character is dropped from the app, related cached data is cleared, and stored login tokens for that character are deleted (from the cloud or from this browser, depending on your storage mode).
- Duplicates — The same character cannot be linked twice; you will see an error if you try.

The main character is never listed here; only non-main linked characters appear.

### Local vs cloud storage

By default, additional character logins are stored only in this browser. If you clear the browser cache or use another device, you must link those characters again.

| Mode | Switch / choice | What it means for you |
|------|-----------------|------------------------|
| Local | “Store Accounts In Cloud” off (default on new accounts) | Additional character tokens stay in this browser. Fast and private to the device, but not portable. |
| Cloud | “Store Accounts In Cloud” on | Additional character tokens are stored encrypted on the server. You can log in on another device and your linked characters come back without re-authorizing each one. |

Switching local → cloud: The app uploads any additional tokens it has in browser storage to the server, then clears that local copy.

Switching cloud → local: Login tokens cannot be copied from server storage into the browser. The app keeps your current character list in memory, but you may need to use Add Account again on this browser if you want tokens stored locally only here. You will see an informational message when this happens.

These preferences save to your account and sync when you use the app on another device.

### First-time setup

During the first-login flow, the same linked-character and storage choices appear in a guided layout: your main character card, Add Account, and a Local / Cloud choice for additional characters. Behaviour matches the Accounts page after setup.

## Community Citadel Names

The middle panel on this page controls whether you share and use anonymously contributed player structure (citadel) names. That helps asset lists and location labels show readable names when ESI does not expose a structure to your characters.

See [Citadel Names](citadel%20names) for how resolution, sharing, and privacy work.

## Related pages

- [Citadel Names](citadel%20names) — Structure name sharing and community lookup
- [Asset Library](asset%20library) — Where resolved structure names appear in asset locations
- [Dashboard](dashboard) — Overview that uses data from your main and linked characters
- [Settings](settings) — Other preferences (layout, jobs, blueprints, and so on)
