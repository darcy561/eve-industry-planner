//go:build windows

package ui

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/atotto/clipboard"
)

func writeClipboard(s string) error {
	var last error
	for attempt := range 3 {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt) * 25 * time.Millisecond)
		}
		if err := setClipboardPowerShell(s); err != nil {
			last = err
			if err2 := setClipboardClip(s); err2 != nil {
				last = err2
			} else if clipboardMatches(s) {
				return nil
			} else {
				last = fmt.Errorf("clip.exe write not verified")
			}
			continue
		}
		if clipboardMatches(s) {
			return nil
		}
		// PowerShell sometimes returns before the clipboard service settles.
		last = fmt.Errorf("clipboard write not verified")
	}
	// Last resort: atotto (no verify if read also broken).
	if err := clipboard.WriteAll(s); err == nil {
		return nil
	}
	if last == nil {
		last = errClipboardUnavailable
	}
	return last
}

func readClipboard() (string, error) {
	if s, err := getClipboardPowerShell(); err == nil {
		return s, nil
	}
	if s, err := clipboard.ReadAll(); err == nil {
		return s, nil
	}
	return "", errClipboardUnavailable
}

func clipboardMatches(want string) bool {
	got, err := readClipboard()
	if err != nil {
		return false
	}
	// PowerShell Get-Clipboard often appends a trailing CRLF that was not written.
	return normalizeClip(got) == normalizeClip(want)
}

func normalizeClip(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	return strings.TrimRight(s, "\n")
}

func setClipboardPowerShell(s string) error {
	// Read stdin so we never shell-escape secret material.
	const script = "$t = [Console]::In.ReadToEnd(); Set-Clipboard -Value $t"
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	cmd.Stdin = strings.NewReader(s)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if stderr.Len() > 0 {
			return fmt.Errorf("Set-Clipboard: %s", strings.TrimSpace(stderr.String()))
		}
		return err
	}
	return nil
}

func getClipboardPowerShell() (string, error) {
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw")
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	// -Raw still often yields a trailing CRLF from the pipeline.
	return strings.TrimRight(string(out), "\r\n"), nil
}

func setClipboardClip(s string) error {
	cmd := exec.Command("cmd", "/c", "clip")
	cmd.Stdin = strings.NewReader(s)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if stderr.Len() > 0 {
			return fmt.Errorf("clip: %s", strings.TrimSpace(stderr.String()))
		}
		return err
	}
	return nil
}
