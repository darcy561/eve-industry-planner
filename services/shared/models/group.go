package models

import "time"

// Group represents a group of jobs for organisation and management
type Group struct {
	SchemaVersion   int           `json:"schemaVersion,omitempty" bson:"schemaVersion,omitempty"`
	AccountID       string        `json:"accountID" bson:"accountID"`
	GroupName       string        `json:"groupName" bson:"groupName"`
	GroupID         string        `json:"groupID" bson:"groupID"`
	IncludedJobIDs  []string      `json:"includedJobIDs" bson:"includedJobIDs"`
	IncludedTypeIDs []int         `json:"includedTypeIDs" bson:"includedTypeIDs"`
	MaterialIDs     []int         `json:"materialIDs" bson:"materialIDs"`
	OutputJobCount  int           `json:"outputJobCount" bson:"outputJobCount"`
	AreComplete     []string      `json:"areComplete" bson:"areComplete"`
	ShowComplete    bool          `json:"showComplete" bson:"showComplete"`
	GroupStatus     int           `json:"groupStatus" bson:"groupStatus"`
	GroupType       int           `json:"groupType" bson:"groupType"`
	LinkedJobIDs    []int64       `json:"linkedJobIDs" bson:"linkedJobIDs"`
	LinkedOrderIDs  []int64       `json:"linkedOrderIDs" bson:"linkedOrderIDs"`
	LinkedTransIDs  []int64       `json:"linkedTransIDs" bson:"linkedTransIDs"`
	MetaData        GroupMetaData `json:"_meta" bson:"_meta"`
}

// GroupMetaData is document metadata under `_meta` (shared MetaData + group lifecycle).
type GroupMetaData struct {
	MetaData      `json:",inline" bson:",inline"`
	CreatedAt     time.Time  `json:"createdAt" bson:"createdAt"`
	LastUpdatedBy string     `json:"lastUpdatedBy" bson:"lastUpdatedBy"`
	ArchivedAt    *time.Time `json:"archivedAt" bson:"archivedAt"`
	ArchivedBy    *string    `json:"archivedBy" bson:"archivedBy"`
}
