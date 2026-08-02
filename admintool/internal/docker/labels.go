package docker

// Swarm / Compose label keys used for membership filters.
const (
	LabelStackNamespace   = "com.docker.stack.namespace"
	LabelComposeProject   = "com.docker.compose.project"
	LabelSwarmServiceName = "com.docker.swarm.service.name"
)
