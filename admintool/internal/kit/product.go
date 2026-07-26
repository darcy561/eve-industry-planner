// Product strings are the SoT for user-facing product strings (CLI + TUI).
package kit

const (
	Name    = "Eve Industry Planner"
	Tagline = "Management Tool"
	CLIName = "eip"

	// StackName is the Swarm stack namespace (com.docker.stack.namespace).
	StackName = CLIName

	// ComposeProjectName is the legacy Compose project (docker-compose.yml name:).
	// Used only to tear down leftover Compose resources on shutdown.
	ComposeProjectName = "eve-industry-planner"
)
