package deploy

// Swarm / container labels stamped by deploy recipes (eip up / eip dev).
const (
	// LabelDeploySource is the SoT key: "live" | "dev".
	// Stamped during stack expand (stack.LabelDeploySource); not written via SDK.
	LabelDeploySource = "eip.deploy.source"
)
