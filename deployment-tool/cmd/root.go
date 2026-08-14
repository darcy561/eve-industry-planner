// Package cmd is the deployment-tool CLI entry facade.
//
// Command implementations live in ./commands (cobra-cli layout).
// Add new commands there for consistency:
//
//	cd deployment-tool/cmd/commands
//	go run github.com/spf13/cobra-cli@v1.3.0 add <name>
//
// Then fill in Run/RunE. Generator is pinned under ../tools (separate
// go.mod) so it does not pull viper into the main deployment-tool module.
package cmd

import "eve-industry-planner/deployment-tool/cmd/commands"

// Execute runs the root command.
func Execute() error {
	return commands.Execute()
}
