package models

import "time"

// Group represents a group of jobs for organization and management
type Group struct {
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

// GroupMetaData represents metadata for group documents (stored as _meta in MongoDB)
type GroupMetaData struct {
	BuildVer      string     `json:"buildVer" bson:"buildVer"`
	CreatedAt     time.Time  `json:"createdAt" bson:"createdAt"`
	LastUpdated   time.Time  `json:"lastUpdated" bson:"lastUpdated"`
	LastUpdatedBy string     `json:"lastUpdatedBy" bson:"lastUpdatedBy"`
	ClientID      string     `json:"clientID,omitempty" bson:"clientID,omitempty"` // ClientID from X-Client-ID header (for change stream filtering)
	ArchivedAt    *time.Time `json:"archivedAt" bson:"archivedAt"`
	ArchivedBy    *string    `json:"archivedBy" bson:"archivedBy"`
}
