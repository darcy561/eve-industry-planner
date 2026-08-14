package lifecycle

import "time"

// AppStopGrace is the in-process cleanup budget for start-first app services.
// Matches stack x-app-stop-grace and websocket DrainForRoll / PlannedDrain wait.
const AppStopGrace = 60 * time.Second
