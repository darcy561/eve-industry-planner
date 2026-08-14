package commands

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/deployment-tool/internal/catalog"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/ops"
	"eve-industry-planner/deployment-tool/internal/process"
)

func init() {
	if v, ok := catalog.ByID("capacity"); ok {
		capacityCmd.Short = v.Short
	}
	rootCmd.AddCommand(capacityCmd)
}

var capacityCmd = &cobra.Command{
	Use:   "capacity [ctl-args...]",
	Short: "Run capacity-controller ctl on the running capacity-controller task",
	Long: `Attach to the Swarm capacity-controller task (eip_capacity-controller) via Moby exec.

Examples:

  eip capacity status
  eip capacity plan
  eip capacity cordon <container_id>
  eip capacity uncordon <container_id>
  eip capacity drain <container_id>
  eip capacity evacuate <container_id>

Evacuate applies cordon→drain→scale for a websocket container_id (forces managed for that Apply).
Automatic Apply for a role requires services.<role>.capacity_controller_managed: true.
Overrides: EIP_CAPACITY_CONTAINER, EIP_CAPACITY_SERVICE, EIP_CAPACITY_WAIT_SEC, EIP_CAPACITY_POLL_SEC.`,
	DisableFlagsInUseLine: true,
	Args:                  cobra.ArbitraryArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		if len(args) > 0 && args[0] == "--" {
			args = args[1:]
		}
		msg.EmitStackForVerb("capacity")

		timeout := capacityContextTimeout()
		ctx, cancel := process.TimeoutSignalContext(timeout)
		defer cancel()

		err := process.MapDoneError(ops.CapacityCtl(ctx, ops.CapacityCtlOpts{Args: args}))
		if err != nil {
			msg.EmitStack("capacity", msg.LightRed, err.Error())
			return err
		}
		msg.EmitStack("capacity", msg.LightGreen, "capacity complete")
		return nil
	},
}

func capacityContextTimeout() time.Duration {
	waitSec := 180
	if v := strings.TrimSpace(os.Getenv("EIP_CAPACITY_WAIT_SEC")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			waitSec = n
		}
	}
	return time.Duration(waitSec)*time.Second + 2*time.Minute
}
