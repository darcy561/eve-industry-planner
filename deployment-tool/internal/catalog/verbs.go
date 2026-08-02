// Package catalog is the SoT for eip CLI verbs (id / help titles).
//
// When adding a verb: add it here first, then wire Cobra under cmd/commands.
// Home TUI menus live in tui/ops (plain-language titles + Health gating); they
// map to these ids via Entry.Args and may omit or remap verbs.
package catalog

// Verb is one eip subcommand exposed to operators.
type Verb struct {
	ID    string // argv[0], e.g. "up"
	Title string // TUI row title
	Short string // help / TUI description
}

// Verbs returns the operator command catalog in menu order.
// doctor is CLI-only in the TUI (hidden); the TUI polls alias "probe" instead.
func Verbs() []Verb {
	return []Verb{
		{ID: "doctor", Title: "Doctor", Short: "Ping Docker Engine and roll up stack health"},
		{ID: "status", Title: "Status", Short: "Expected services vs live Swarm stack"},
		{ID: "up", Title: "Up", Short: "Bring up Swarm stack (live images)"},
		{ID: "dev", Title: "Dev", Short: "Bring up Swarm stack with local bake images"},
		{ID: "sync", Title: "Sync", Short: "Apply eip.config.yaml (capacity, Traefik, Grafana, configs)"},
		{ID: "logs", Title: "Logs", Short: "Show Swarm service logs (dump or follow)"},
		{ID: "cli", Title: "CLI", Short: "Run core tasks or open a shell on the running core task"},
		{ID: "secrets", Title: "Secrets", Short: "Sync .env secrets to Swarm and rematerialize mounts"},
		{ID: "rebuild", Title: "Rebuild", Short: "Bake local images and rematerialize (roll only when digests change)"},
		{ID: "restart", Title: "Restart", Short: "Rolling restart (same images; one service or all)"},
		{ID: "shutdown", Title: "Shutdown", Short: "Stop the app completely (keeps volumes / data)"},
		{ID: "update", Title: "Update", Short: "Update binary, stacks, and live images (--binary-only / --stacks-only / --images-only)"},
		{ID: "repair", Title: "Repair", Short: "Heal unhealthy stack services (selective ensure; no cold start / pull)"},
		{ID: "add-path", Title: "Add to PATH", Short: "Optional: symlink eip onto PATH so you can run eip from any directory"},
		{ID: "init", Title: "Init", Short: "Write missing stack YAML / .env / eip.config.yaml"},
		{ID: "ensure-mongo", Title: "Ensure mongo", Short: "Ensure mongo RS, users, preimages, and indexes (CLI)"},
		{ID: "ensure-s3", Title: "Ensure S3", Short: "Ensure SeaweedFS app buckets static-data / static-data-test (CLI)"},
		{ID: "restore-mongo-keyfile", Title: "Restore mongo keyfile", Short: "Restore ./mongo-keyfile (+ .bak) from a running mongo task (CLI)"},
		{ID: "rekey-mongo", Title: "Rekey mongo", Short: "Rekey ./mongo-keyfile using MONGO_ROOT_* when stack is down (CLI)"},
	}
}

// ByID looks up a verb by CLI id.
func ByID(id string) (Verb, bool) {
	for _, v := range Verbs() {
		if v.ID == id {
			return v, true
		}
	}
	return Verb{}, false
}
