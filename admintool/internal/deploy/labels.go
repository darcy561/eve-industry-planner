package deploy

// Swarm / container labels stamped by deploy recipes (eip up / eip dev).
const (
	// LabelDeploySource is the SoT key: "live" | "dev".
	LabelDeploySource = "eip.deploy.source"
)

// LabelsForSource returns the label map a deploy chunk should apply for src.
// Only live/dev produce labels; mixed/unknown are not written.
func LabelsForSource(src Source) map[string]string {
	switch src {
	case SourceLive, SourceDev:
		return map[string]string{LabelDeploySource: string(src)}
	default:
		return nil
	}
}
