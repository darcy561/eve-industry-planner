// Package templates is the init facade for operator document templates.
//
//	.env schema/emit/autogen → kit/templates/env
//	eip.config.yaml defaults → kit/templates/yamldefaults
//
// Live load/validate/sync of eip.config.yaml stays in package config.
package templates

import (
	"eve-industry-planner/admintool/internal/kit/templates/env"
	"eve-industry-planner/admintool/internal/kit/templates/yamldefaults"
)

// WriteMissingEnv writes a registry-based .env when missing.
func WriteMissingEnv(home string) (bool, error) {
	return env.WriteMissing(home)
}

// WriteMissingConfig writes yamldefaults.DefaultConfig() when eip.config.yaml is missing.
func WriteMissingConfig(home string) (bool, error) {
	return yamldefaults.WriteMissing(home)
}
