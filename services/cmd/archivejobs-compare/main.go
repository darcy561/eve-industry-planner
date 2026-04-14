// Command archivejobs-compare loads Firestore export JSON (CLI wrapper with "data")
// and either prints a before/after summary to stdout or writes paired JSON files (-out).
//
// Run from services/:
//
//	go run ./cmd/archivejobs-compare -samples ../archivejobs_firestore_samples -limit 5
//	go run ./cmd/archivejobs-compare -samples ../archivejobs_firestore_samples -limit 0 -out ../archivejobs_firestore_normalized
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"eve-industry-planner/shared/shared/archiveimport"
	"eve-industry-planner/shared/shared/models"
)

type exportFile struct {
	Data          map[string]any `json:"data"`
	UserID        string         `json:"userId"`
	FirestorePath string         `json:"firestorePath"`
}

// normalizedPair is written next to each export for diffing: original shape uses "data",
// this file holds "job" (models.Job) plus import metadata.
type normalizedPair struct {
	SourceFile        string    `json:"sourceFile"`
	FirestorePath     string    `json:"firestorePath,omitempty"`
	UserID            string    `json:"userId,omitempty"`
	AccountIDUsed     string    `json:"accountIDUsed"`
	CanonicalBuildVer string    `json:"canonicalBuildVer"`
	Job               models.Job `json:"job"`
}

func main() {
	samplesDir := flag.String("samples", "../archivejobs_firestore_samples", "directory with job_*.json exports")
	outDir := flag.String("out", "", "if set, write <basename>.normalized.json here and skip stdout summaries (errors still log)")
	limit := flag.Int("limit", 8, "max files to process (0 = all)")
	account := flag.String("account", "import-preview", "fallback accountID when export JSON has no userId (otherwise userId is used as job accountID)")
	buildVer := flag.String("build-ver", "", `canonical build version recorded in compare output only; if empty, reads "version" from -package-json`)
	packageJSON := flag.String("package-json", "../frontend/package.json", `path to package.json when -build-ver is empty (relative to cwd, usually services/)`)
	fullJSON := flag.Bool("json", false, "with terminal mode: print full models.Job JSON after each summary")
	flag.Parse()

	canonicalBV := strings.TrimSpace(*buildVer)
	if canonicalBV == "" {
		v, err := archiveimport.VersionFromPackageJSON(*packageJSON)
		if err != nil {
			log.Fatalf("build-ver: %v (set -build-ver or fix -package-json)", err)
		}
		canonicalBV = v
	}

	entries, err := collectJobFiles(*samplesDir)
	if err != nil {
		log.Fatal(err)
	}
	if *limit > 0 && len(entries) > *limit {
		entries = entries[:*limit]
	}

	writeFiles := strings.TrimSpace(*outDir) != ""
	if writeFiles {
		if err := os.MkdirAll(*outDir, 0o755); err != nil {
			log.Fatalf("mkdir out: %v", err)
		}
	}

	var okN int
	for _, path := range entries {
		base := filepath.Base(path)
		b, err := os.ReadFile(path)
		if err != nil {
			log.Printf("%s: read: %v", base, err)
			continue
		}
		var wrap exportFile
		if err := json.Unmarshal(b, &wrap); err != nil {
			log.Printf("%s: parse: %v", base, err)
			continue
		}
		if wrap.Data == nil {
			log.Printf("%s: no data", base)
			continue
		}

		rawID := summarizeRawJobID(wrap.Data)
		rawBV, _ := wrap.Data["buildVer"].(string)
		rawSetup := setupKeyCount(wrap.Data)

		accountID := strings.TrimSpace(*account)
		if uid := strings.TrimSpace(wrap.UserID); uid != "" {
			accountID = uid
		}

		job, err := archiveimport.JobFromFirestoreMap(wrap.Data, accountID)
		if err != nil {
			if writeFiles {
				log.Printf("%s: ERROR %v", base, err)
			} else {
				fmt.Printf("\n## %s\n  ERROR: %v\n", base, err)
			}
			continue
		}

		if writeFiles {
			stem := strings.TrimSuffix(base, ".json")
			outPath := filepath.Join(*outDir, stem+".normalized.json")
			doc := normalizedPair{
				SourceFile:        base,
				FirestorePath:     wrap.FirestorePath,
				UserID:            wrap.UserID,
				AccountIDUsed:     accountID,
				CanonicalBuildVer: canonicalBV,
				Job:               job,
			}
			payload, merr := json.MarshalIndent(doc, "", "  ")
			if merr != nil {
				log.Printf("%s: marshal: %v", base, merr)
				continue
			}
			if werr := os.WriteFile(outPath, payload, 0o644); werr != nil {
				log.Printf("%s: write %s: %v", base, outPath, werr)
				continue
			}
			okN++
			continue
		}

		fmt.Printf("\n## %s\n", base)
		fmt.Printf("  %-26s %s\n", "raw jobID (Firestore):", rawID)
		fmt.Printf("  %-26s %q\n", "models.Job.JobID:", job.JobID)
		fmt.Printf("  %-26s %q\n", "models.Job._meta.accountID:", job.MetaData.AccountID)
		fmt.Printf("  %-26s %q\n", "raw buildVer (root):", rawBV)
		fmt.Printf("  %-26s %q\n", "canonical build ver (migration):", canonicalBV)
		fmt.Printf("  %-26s %d (raw setup maps)\n", "build.setup count:", rawSetup)
		fmt.Printf("  %-26s %d\n", "normalized setup count:", len(job.Build.Setup))
		fmt.Printf("  %-26s %d\n", "itemsProducedPerRun:", job.ItemsProducedPerRun)
		fmt.Printf("  %-26s %q\n", "groupID:", job.GroupID)
		fmt.Printf("  %-26s %v\n", "includedInGroup:", job.IncludedInGroup)
		fmt.Printf("  %-26s %v\n", "displayOnPlanner:", job.DisplayOnPlanner)
		fmt.Printf("  %-26s %d\n", "materials:", len(job.Build.Materials))
		fmt.Printf("  %-26s %d\n", "childJobs keys:", len(job.Build.ChildJobs))

		if *fullJSON {
			out, err := json.MarshalIndent(job, "", "  ")
			if err != nil {
				fmt.Printf("  marshal job: %v\n", err)
				continue
			}
			fmt.Printf("\n  --- normalized models.Job (JSON) ---\n%s\n", string(out))
		}
	}

	if !writeFiles {
		fmt.Println()
	}
}

func summarizeRawJobID(data map[string]any) string {
	v, ok := data["jobID"]
	if !ok {
		return "<missing>"
	}
	switch x := v.(type) {
	case float64:
		return fmt.Sprintf("%s (JSON number)", strconv.FormatInt(int64(x), 10))
	case string:
		return fmt.Sprintf("%q (string)", x)
	default:
		return fmt.Sprintf("%v (%T)", v, v)
	}
}

func setupKeyCount(data map[string]any) int {
	b, _ := data["build"].(map[string]any)
	if b == nil {
		return 0
	}
	s, _ := b["setup"].(map[string]any)
	return len(s)
}

func collectJobFiles(dir string) ([]string, error) {
	var out []string
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		name := d.Name()
		if !strings.HasPrefix(name, "job_") || !strings.HasSuffix(name, ".json") {
			return nil
		}
		if strings.Contains(name, ".normalized.") {
			return nil
		}
		out = append(out, path)
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(out)
	return out, nil
}
