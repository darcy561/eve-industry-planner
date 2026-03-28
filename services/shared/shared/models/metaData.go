package models

import "time"

type MetaData struct {
	LastModified time.Time `bson:"lastModified" json:"lastModified"`
	AccountID    string    `bson:"accountID" json:"accountID"`
}
