package commands

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/process"
)

func init() {
	rootCmd.AddCommand(doctorCmd)
}

// doctor is the public CLI health check. Alias "probe" is used by the TUI poller.
var doctorCmd = &cobra.Command{
	Use:     "doctor",
	Aliases: []string{"probe"},
	Short:   "Ping Docker Engine and roll up stack health (SDK)",
	Args:    cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runEngineProbe(cmd)
	},
}

func runEngineProbe(cmd *cobra.Command) error {
	ctx, cancel := process.TimeoutSignalContext(4 * time.Second)
	defer cancel()

	probe := docker.Probe(ctx)

	// TUI child: chip.docker + chip.health + chip.app. Never chip.stack / pane.*.
	if msg.Enabled() {
		if probe.Err != nil && probe.Engine.APIVersion == "" {
			msg.EmitDockerFromSwarm("", "", true)
			msg.EmitHealthFromProbe(msg.LightOff, "engine down")
			// Keep last known app version in the TUI (do not emit clear on hard down).
			return nil
		}
		detail := fmt.Sprintf("api %s", probe.Engine.APIVersion)
		if probe.Engine.ServerVersion != "" {
			detail = fmt.Sprintf("api %s · server %s", probe.Engine.APIVersion, probe.Engine.ServerVersion)
		}
		msg.EmitDockerFromSwarm(probe.Engine.Swarm, detail, false)
		msg.EmitHealthFromProbe(probe.Health.String(), probe.HealthDetail)
		msg.EmitAppVersion(probe.AppVersion)
		return nil
	}

	out := cmd.OutOrStdout()
	host := probe.Engine.Host
	if host == "" {
		host = "default"
	}
	if probe.Err != nil {
		if probe.Engine.APIVersion != "" {
			fmt.Fprintf(out, "eip %s\n", Version)
			fmt.Fprintf(out, "docker: host=%s api=%s ping=ok (%v)\n", host, probe.Engine.APIVersion, probe.Err)
			fmt.Fprintf(out, "health: off\n")
			return nil
		}
		return probe.Err
	}

	fmt.Fprintf(out, "eip %s\n", Version)
	if probe.AppVersion != "" {
		fmt.Fprintf(out, "app %s\n", probe.AppVersion)
	}
	fmt.Fprintf(out, "docker: host=%s api=%s server=%s swarm=%s\n",
		host, probe.Engine.APIVersion, probe.Engine.ServerVersion, probe.Engine.Swarm)
	fmt.Fprintf(out, "health: %s", probe.Health.String())
	if probe.HealthDetail != "" {
		fmt.Fprintf(out, " (%s)", probe.HealthDetail)
	}
	fmt.Fprintln(out)
	return nil
}
