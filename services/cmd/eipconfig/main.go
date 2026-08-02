// Command eipconfig: validate operator YAML and apply make-sync diffs (#19 / #32).
package main

import (
	"fmt"
	"os"
	"strings"

	"eve-industry-planner/eipconfig"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "sync-env":
		cfgPath := flagValue(os.Args[2:], "--config", "eip.config.yaml")
		cfg, err := eipconfig.LoadYAML(cfgPath)
		if err != nil {
			fatal(err)
		}
		for _, line := range cfg.SyncEnv() {
			fmt.Println(line)
		}
	case "summary":
		cfgPath := flagValue(os.Args[2:], "--config", "eip.config.yaml")
		cfg, err := eipconfig.LoadYAML(cfgPath)
		if err != nil {
			fatal(err)
		}
		for _, line := range cfg.SummaryLines() {
			fmt.Println(line)
		}
	case "validate":
		cfgPath := flagValue(os.Args[2:], "--config", "eip.config.yaml")
		if _, err := eipconfig.LoadYAML(cfgPath); err != nil {
			fatal(err)
		}
		fmt.Println("ok")
	case "apply":
		cfgPath := flagValue(os.Args[2:], "--config", "eip.config.yaml")
		dry := hasFlag(os.Args[2:], "--dry-run") || hasFlag(os.Args[2:], "-n")
		cfg, err := eipconfig.LoadYAML(cfgPath)
		if err != nil {
			fatal(err)
		}
		if err := eipconfig.ApplyConfig(cfg, dry); err != nil {
			fatal(err)
		}
	case "advertise":
		// App-train / rollout only — flips Redis SoT + PUBLISH. Not part of make swarm-sync.
		// Version SoT is .env APP_VERSION (pass --version from make advertise).
		want := flagValue(os.Args[2:], "--version", "")
		if want == "" {
			want = strings.TrimSpace(os.Getenv("APP_VERSION"))
		}
		dry := hasFlag(os.Args[2:], "--dry-run") || hasFlag(os.Args[2:], "-n")
		if err := eipconfig.ApplyAdvertisedVersion(want, dry); err != nil {
			fatal(err)
		}
	case "discover-config-sync":
		// TSV: key\tfile\tservice\ttarget (yaml.v3 parse).
		stackPath := eipconfig.ResolveStackPath(flagValue(os.Args[2:], "--stack", eipconfig.DataStackFile()))
		targets, err := eipconfig.DiscoverConfigSyncTargets(stackPath)
		if err != nil {
			fatal(err)
		}
		for _, t := range targets {
			fmt.Printf("%s\t%s\t%s\t%s\n", t.Key, t.File, t.Service, t.Target)
		}
	case "discover-secret-attach":
		// TSV: service\tkey — SoT is docker-stack.yml secrets: lists.
		stackPath := eipconfig.ResolveStackPath(flagValue(os.Args[2:], "--stack", eipconfig.AppStackFile()))
		targets, err := eipconfig.DiscoverSecretAttachTargets(stackPath)
		if err != nil {
			fatal(err)
		}
		for _, t := range targets {
			fmt.Printf("%s\t%s\n", t.Service, t.Key)
		}
	case "discover-capacity-sync":
		// TSV: yamlKey\tswarmService — debug / tests.
		stackPath := eipconfig.ResolveStackPath(flagValue(os.Args[2:], "--stack", eipconfig.AppStackFile()))
		targets, err := eipconfig.DiscoverCapacitySyncTargets(stackPath)
		if err != nil {
			fatal(err)
		}
		for _, t := range targets {
			fmt.Printf("%s\t%s\n", t.YAMLKey, t.SwarmService)
		}
	case "list-stack-services":
		stackPath := eipconfig.ResolveStackPath(flagValue(os.Args[2:], "--stack", eipconfig.AppStackFile()))
		names, err := eipconfig.ListStackServices(stackPath)
		if err != nil {
			fatal(err)
		}
		for _, n := range names {
			fmt.Println(n)
		}
	case "stack-service-image":
		stackPath := eipconfig.ResolveStackPath(flagValue(os.Args[2:], "--stack", eipconfig.AppStackFile()))
		svc := flagValue(os.Args[2:], "--service", "")
		if svc == "" {
			fatal(fmt.Errorf("--service is required"))
		}
		img, err := eipconfig.StackServiceImage(stackPath, svc)
		if err != nil {
			fatal(err)
		}
		fmt.Println(img)
	default:
		usage()
		os.Exit(2)
	}
}

func flagValue(args []string, name, fallback string) string {
	for i := 0; i < len(args); i++ {
		if args[i] == name && i+1 < len(args) {
			return args[i+1]
		}
		if len(args[i]) > len(name)+1 && args[i][:len(name)+1] == name+"=" {
			return args[i][len(name)+1:]
		}
	}
	return fallback
}

func hasFlag(args []string, name string) bool {
	for _, a := range args {
		if a == name {
			return true
		}
	}
	return false
}

func usage() {
	fmt.Fprintf(os.Stderr, "usage:\n")
	fmt.Fprintf(os.Stderr, "  eipconfig validate  --config eip.config.yaml\n")
	fmt.Fprintf(os.Stderr, "  eipconfig sync-env  --config eip.config.yaml\n")
	fmt.Fprintf(os.Stderr, "  eipconfig summary   --config eip.config.yaml\n")
	fmt.Fprintf(os.Stderr, "  eipconfig apply     --config eip.config.yaml [--dry-run]\n")
	fmt.Fprintf(os.Stderr, "  eipconfig advertise --version X.Y.Z [--dry-run]  # Redis SoT from .env APP_VERSION\n")
	fmt.Fprintf(os.Stderr, "  eipconfig discover-config-sync [--stack docker-stack.data.yml]\n")
	fmt.Fprintf(os.Stderr, "  eipconfig discover-secret-attach [--stack docker-stack.yml]\n")
	fmt.Fprintf(os.Stderr, "  eipconfig discover-capacity-sync [--stack docker-stack.yml]\n")
	fmt.Fprintf(os.Stderr, "  eipconfig list-stack-services [--stack docker-stack.yml]\n")
	fmt.Fprintf(os.Stderr, "  eipconfig stack-service-image --service NAME [--stack docker-stack.yml]\n")
}

func fatal(err error) {
	fmt.Fprintf(os.Stderr, "eipconfig: %v\n", err)
	os.Exit(1)
}
