# Application settings / user account persistence audit

Post-refactor mapping: each row is one **call site** and which Mongo API it targets.

| File | Trigger / handler | `PUT /api/v1/user/application-settings` | `PUT /api/v1/user/main` |
|------|-------------------|------------------------------------------|-------------------------|
| `Functions/JobPlanner/deleteMultipleJobs.js` | Mass delete removes linked ESI IDs from account | | Yes (`saveUserAccountDocument`) |
| `Components/Settings/Standard Layout/jobSettingsFrame.jsx` | Debounced job settings save | Yes | |
| `Components/Accounts/Additional Accounts.jsx` | Debounced save after cloud toggle / imports | Yes | Yes (`saveUserAccountAndApplicationSettings`) |
| `Hooks/JobHooks/useCloseActiveJob.jsx` | Close job updates linked ESI sets | | Yes (`saveUserAccountDocument`) |
| `Components/Settings/Standard Layout/Custom Structures/structureSelection.jsx` | Structure selection change | Yes | |
| `Components/Settings/Standard Layout/Custom Structures/reprocessingStructureSelection.jsx` | Reprocessing structure selection | Yes | |
| `Components/Accounts/AccountEntry.jsx` | Debounced save after removing linked character (cloud) | | Yes (`saveUserAccountDocument`) |
| `Components/Settings/Standard Layout/blueprintSettingsFrame.jsx` | Blueprint prefs (multiple handlers) | Yes | |
| `Components/Settings/Standard Layout/Custom Structures/currentStructures.jsx` | Current structures update | Yes | |
| `Components/Settings/Standard Layout/layoutSettingsFrame.jsx` | Layout prefs | Yes | |
| `Components/Tutorials/tutorialTemplate.jsx` | Dismiss tutorial / help cards | Yes | |
| `Components/Edit Job/.../purchsingDataPanel.jsx` | Purchasing panel prefs | Yes | |
| `Components/Edit Job/.../archiveJobButton.jsx` | Archive job (prune linked ESI IDs) | | Yes (`saveUserAccountDocument`) |
| `Hooks/GroupHooks/useArchiveGroupJobs.jsx` | Archive group (prune linked ESI IDs) | | Yes (`saveUserAccountDocument`) |
| `Components/Reprocessing/reprocessingSettingsPanel.jsx` | Reprocessing prefs | Yes | |
| `Components/Settings/Standard Layout/Job Settings/customSystemIndexes.jsx` | Custom system indexes | Yes | |
| `Functions/Structure/addCustomStructure.js` | Add custom structure | Yes | |
| `Components/Settings/Standard Layout/ReprocessingSettingsFrame.jsx` | Reprocessing settings frame | Yes | |
| `Components/Settings/Standard Layout/Job Settings/customExtrasFrame.jsx` | Extras categories | Yes | |
| `Components/Job Planner/Planner Components/StatusSettings.jsx` | Planner status labels | Yes | |
| `Hooks/GeneralHooks/useGlobalDebounce.js` | JSDoc example only | Yes (example) | |

**Module**

- `Functions/Endpoints/Pirivate/userDocument.js` — `saveApplicationSettings()`, `saveUserAccountDocument()`, `saveUserAccountAndApplicationSettings()`, `getUserAccountDocument()`. Each HTTP call uses `withRequestRetries` (see `Functions/Endpoints/withRequestRetries.js`).

**Removed**

- `Functions/Firebase/uploadApplicationSettings.js` (replaced by the above).
- API route `GET/PUT /api/migration/application-settings` (Mongo-only v1 routes are source of truth).
