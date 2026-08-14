package commands

import (
	"fmt"
	"path/filepath"
	"runtime"

	"github.com/spf13/cobra"

	"eve-industry-planner/deployment-tool/internal/catalog"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/msg"
)

func init() {
	if v, ok := catalog.ByID("add-path"); ok {
		addPathCmd.Short = v.Short
	}
	addPathCmd.Flags().String("dir", "", "directory for the symlink (default: first writable of /usr/local/bin, ~/.local/bin, ~/bin, or %LOCALAPPDATA%\\eip\\bin on Windows)")
	addPathCmd.Flags().Bool("remove", false, "remove a symlink previously created by eip add-path")
	rootCmd.AddCommand(addPathCmd)
}

var addPathCmd = &cobra.Command{
	Use:   "add-path",
	Short: "Add eip to PATH via a symlink (optional)",
	Long: `Create a symlink named eip (eip.exe on Windows) that points at this binary,
so you can run "eip up" from any directory once the link directory is on PATH.

Project home stays the folder that contains the real binary (symlinks are
resolved). Safe for headless servers and desktop use alike.

  eip add-path              # install
  eip add-path --remove     # uninstall
  eip add-path --dir ~/bin  # choose directory

Does not modify shell profiles. If the chosen directory is not on PATH, the
command prints how to add it. CLI-only (not on the TUI menu).`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		dir, _ := cmd.Flags().GetString("dir")
		remove, _ := cmd.Flags().GetBool("remove")
		msg.EmitStackForVerb("add-path")

		if remove {
			linkPath, err := kit.RemovePathLink(dir)
			if err != nil {
				msg.EmitStack("add-path", msg.LightRed, err.Error())
				return err
			}
			msg.Line(fmt.Sprintf("removed %s", linkPath))
			msg.EmitStack("add-path", msg.LightGreen, "removed")
			return nil
		}

		linkPath, err := kit.InstallPathLink(dir)
		if err != nil {
			msg.EmitStack("add-path", msg.LightRed, err.Error())
			return err
		}
		linkDir := filepath.Dir(linkPath)
		msg.Line(fmt.Sprintf("linked %s → %s", linkPath, mustResolvedExe()))
		if kit.DirOnPATH(linkDir) {
			msg.Line(`PATH already includes that directory — try: eip version`)
			msg.EmitStack("add-path", msg.LightGreen, "on PATH")
			return nil
		}
		msg.Line("that directory is not on PATH yet — add it, then open a new shell:")
		msg.Line(pathHint(linkDir))
		msg.EmitStack("add-path", msg.LightAmber, "add dir to PATH")
		return nil
	},
}

func mustResolvedExe() string {
	p, err := kit.ResolvedExecutable()
	if err != nil {
		return "?"
	}
	return p
}

func pathHint(dir string) string {
	if runtime.GOOS == "windows" {
		return fmt.Sprintf("  PowerShell:  [Environment]::SetEnvironmentVariable(\"Path\", $env:Path + \";%s\", \"User\")", dir)
	}
	return fmt.Sprintf("  echo 'export PATH=\"%s:$PATH\"' >> ~/.profile   # then: source ~/.profile", dir)
}
