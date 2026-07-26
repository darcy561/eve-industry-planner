package sde

import "time"

const (
	LiveDataDirName        = "live_data"
	VersionFileName        = "version.json"
	RecipeListFile         = "recipeList.json"
	SearchIndexFile        = "searchIndex.json"
	FullItemListFile       = "fullItemList.json"
	ReprocessingFile       = "reprocessingData.json"
	InventionModifiersFile = "inventionModifiers.json"
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
	{Key: "INVENTION_MODIFIERS", FileName: InventionModifiersFile},
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
