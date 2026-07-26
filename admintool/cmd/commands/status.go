package commands

import (
	"context"
	"fmt"
	"time"

	"github.com/docker/docker/client"
	"github.com/spf13/cobra"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/deploy"
	"eve-industry-planner/admintool/internal/docker"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/status"
)

func init() {
	if v, ok := catalog.ByID("status"); ok {
		statusCmd.Short = v.Short
	}
	rootCmd.AddCommand(statusCmd)
}

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Expected services vs live Swarm stack",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runStatus(cmd)
	},
}

func runStatus(cmd *cobra.Command) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	cli, err := docker.NewClient(client.WithTimeout(docker.DefaultClientTimeout))
	if err != nil {
		return fmt.Errorf("docker client: %w", err)
	}
	defer cli.Close()

	view, err := deploy.Inspect(ctx, cli)
	if err != nil {
		return err
	}

	report := status.Build(view)

	if msg.Enabled() {
		msg.EmitStatus(report)
		msg.EmitStack(string(report.Overall), statusMsgLight(report.Overall), report.OverallDetail)
		return nil
	}

	fmt.Fprint(cmd.OutOrStdout(), status.FormatPlain(report))
	return nil
}

func statusMsgLight(sig status.Signal) string {
	switch sig {
	case status.OK:
		return msg.LightGreen
	case status.OKStar, status.Partial:
		return msg.LightAmber
	default:
		return msg.LightRed
	}
}
