//go:build tools

// Package tools pins cobra-cli for scaffolding new admintool commands.
// Kept in a nested module so viper/etc. stay out of admintool/go.mod.
//
//	cd admintool/cmd/commands
//	go run github.com/spf13/cobra-cli@v1.3.0 add <name>
package tools

import (
	_ "github.com/spf13/cobra-cli"
)
