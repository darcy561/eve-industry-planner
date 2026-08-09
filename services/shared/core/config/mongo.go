package config

import (
	"fmt"
	"net/url"
	"strings"

	"eve-industry-planner/shared/core/swarmsecret"
)

const (
	mongoDatabase   = "eve_industry_planner"
	mongoReplicaSet = "rs0"
)

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
	return "mongodb://" + escapedUser + ":" + escapedPass + "@" + mongoHost + ":" + mongoPort + "/" + mongoDatabase + "?authSource=" + mongoDatabase + "&replicaSet=" + mongoReplicaSet, nil
}
