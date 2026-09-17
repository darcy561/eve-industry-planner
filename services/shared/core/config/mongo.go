package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"

	"eve-industry-planner/shared/core/swarmsecret"
)

const (
	// DefaultMongoDatabase is the database every service works in, and the one
	// the app user is created in. It is also the authSource for every client,
	// whatever database that client then works in.
	DefaultMongoDatabase = "eve_industry_planner"

	// EnvMongoDatabase points a client at another database. Only the live test
	// suite sets it; services run on the default.
	EnvMongoDatabase = "MONGO_DATABASE"

	mongoReplicaSet = "rs0"
)

// MongoDatabase is the database a client works in.
//
// Read at the call rather than resolved once, so a test that sets the variable
// after the process has started still moves.
func MongoDatabase() string {
	if name := strings.TrimSpace(os.Getenv(EnvMongoDatabase)); name != "" {
		return name
	}
	return DefaultMongoDatabase
}

// MongoURL builds the MongoDB connection URI from the shared app user
// (MONGO_USERNAME / MONGO_PASSWORD).
func MongoURL() (string, error) {
	user, err := swarmsecret.Require("MONGO_USERNAME")
	if err != nil {
		return "", err
	}
	pass, err := swarmsecret.Require("MONGO_PASSWORD")
	if err != nil {
		return "", err
	}
	return mongoURLFromUserPass(user, pass, "MONGO_USERNAME", "MONGO_PASSWORD")
}

func mongoURLFromUserPass(username, password, userKey, passKey string) (string, error) {
	if strings.TrimSpace(username) == "" {
		return "", fmt.Errorf("%s is required", userKey)
	}
	if strings.TrimSpace(password) == "" {
		return "", fmt.Errorf("%s is required", passKey)
	}
	mongoHost, err := swarmsecret.Require("MONGO_HOST")
	if err != nil {
		return "", err
	}
	mongoPort, err := swarmsecret.Require("MONGO_PORT")
	if err != nil {
		return "", err
	}
	escapedUser := url.QueryEscape(username)
	escapedPass := url.QueryEscape(password)
	// authSource does not follow MongoDatabase: the app user lives in the default
	// database, so authentication names it whatever database the client works in.
	return "mongodb://" + escapedUser + ":" + escapedPass + "@" + mongoHost + ":" + mongoPort +
		"/" + MongoDatabase() + "?authSource=" + DefaultMongoDatabase + "&replicaSet=" + mongoReplicaSet, nil
}
