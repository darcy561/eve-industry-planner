//go:build !windows

package ui

import (
	"fmt"

	"github.com/atotto/clipboard"
)

func writeClipboard(s string) error {
	if err := clipboard.WriteAll(s); err != nil {
		return fmt.Errorf("%w: %v", errClipboardUnavailable, err)
	}
	return nil
}

func readClipboard() (string, error) {
	if s, err := clipboard.ReadAll(); err == nil {
		return s, nil
	}
	return "", errClipboardUnavailable
}
