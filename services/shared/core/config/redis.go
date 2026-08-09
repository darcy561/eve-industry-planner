package config

import (
	"fmt"
	"net/url"
	"strings"

	"eve-industry-planner/shared/core/swarmsecret"
)

// RedisURL builds redis:// from shared REDIS_PASSWORD (+ host/port).
func RedisURL() (string, error) {
	pass, err := swarmsecret.Require("REDIS_PASSWORD")
	if err != nil {
		return "", err
	}
	return redisURLFromUserPass("", pass, "REDIS_PASSWORD")
}

func redisURLFromUserPass(username, password, passKey string) (string, error) {
	if strings.TrimSpace(password) == "" {
		return "", fmt.Errorf("%s is required", passKey)
	}
	redisHost, err := swarmsecret.Require("REDIS_HOST")
	if err != nil {
		return "", err
	}
	redisPort, err := swarmsecret.Require("REDIS_PORT")
	if err != nil {
		return "", err
	}
	if username != "" {
		return "redis://" + url.UserPassword(username, password).String() + "@" + redisHost + ":" + redisPort, nil
	}
	return "redis://:" + password + "@" + redisHost + ":" + redisPort, nil
}
