package config

import (
	"errors"
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
// (MONGO_USERNAME / MONGO_PASSWORD). Used by worker / core / websocket today.
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

// MongoURLAPI prefers MONGO_USERNAME_API / MONGO_PASSWORD_API when both
// are set. Empty pair falls back to MongoURL. Incomplete pair errors.
func MongoURLAPI() (string, error) {
	u := swarmsecret.Get("MONGO_USERNAME_API")
	p := swarmsecret.Get("MONGO_PASSWORD_API")
	switch {
	case u != "" && p != "":
		return mongoURLFromUserPass(u, p, "MONGO_USERNAME_API", "MONGO_PASSWORD_API")
	case u != "" || p != "":
		return "", errors.New("MONGO_USERNAME_API and MONGO_PASSWORD_API must both be set, or both empty to use shared MONGO_USERNAME/PASSWORD")
	default:
		return MongoURL()
	}
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
