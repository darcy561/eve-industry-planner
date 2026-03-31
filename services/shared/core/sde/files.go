package sde

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

const (
	DefaultDataDir   = "/static-data"
	LiveDataDirName  = "live_data"
	VersionFileName  = "version.json"
	RecipeListFile   = "recipeList.json"
	SearchIndexFile  = "searchIndex.json"
	FullItemListFile = "fullItemList.json"
	ReprocessingFile = "reprocessingData.json"
)

type StaticDataFileDef struct {
	Key      string
	FileName string
}

var staticDataFileDefs = []StaticDataFileDef{
	{Key: "SEARCH_INDEX", FileName: SearchIndexFile},
	{Key: "FULL_ITEM_LIST", FileName: FullItemListFile},
	{Key: "REPROCESSING_DATA", FileName: ReprocessingFile},
	{Key: "RECIPE_LIST", FileName: RecipeListFile},
}

type VersionJSON struct {
	Version      string    `json:"version"`
	BuildNumber  int       `json:"build_number"`
	ReleaseDate  string    `json:"release_date"`
	Key          string    `json:"key"`
	DownloadURL  string    `json:"download_url"`
	DownloadedAt time.Time `json:"downloaded_at"`
	GeneratedAt  time.Time `json:"generated_at,omitempty"`
	Source       string    `json:"source"`
}

func ResolveDataDir() string {
	if dataDir := os.Getenv("SDE_DATA_DIR"); dataDir != "" {
		return dataDir
	}
	return DefaultDataDir
}

func LiveDataDir(dataDir string) string {
	return filepath.Join(dataDir, LiveDataDirName)
}

func LiveDataFilePath(dataDir, fileName string) string {
	return filepath.Join(LiveDataDir(dataDir), fileName)
}

// OutputFileNames returns the canonical set of SDE output files.
func OutputFileNames() []string {
	names := make([]string, 0, len(staticDataFileDefs))
	for _, def := range staticDataFileDefs {
		names = append(names, def.FileName)
	}
	return names
}

// OutputFilesByKey returns frontend-facing logical keys mapped to actual file names.
func OutputFilesByKey() map[string]string {
	byKey := make(map[string]string, len(staticDataFileDefs))
	for _, def := range staticDataFileDefs {
		byKey[def.Key] = def.FileName
	}
	return byKey
}

// RequiredOutputPaths returns absolute paths for version.json and live output files.
func RequiredOutputPaths(dataDir string) []string {
	out := []string{filepath.Join(dataDir, VersionFileName)}
	for _, name := range OutputFileNames() {
		out = append(out, LiveDataFilePath(dataDir, name))
	}
	return out
}

func ReadVersionJSON(dataDir string) (*VersionJSON, error) {
	path := filepath.Join(dataDir, VersionFileName)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var v VersionJSON
	if err := json.Unmarshal(data, &v); err != nil {
		return nil, err
	}
	return &v, nil
}
