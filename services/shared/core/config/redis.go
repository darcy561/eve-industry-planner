package config

import (
	"errors"
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

// RedisURLAPI prefers REDIS_PASSWORD_API when set (optional REDIS_USERNAME_API
// for Redis ACL). Empty password falls back to RedisURL.
func RedisURLAPI() (string, error) {
	pass := swarmsecret.Get("REDIS_PASSWORD_API")
	if pass == "" {
		if swarmsecret.Get("REDIS_USERNAME_API") != "" {
			return "", errors.New("REDIS_PASSWORD_API is required when REDIS_USERNAME_API is set (or clear both to use shared REDIS_PASSWORD)")
		}
		return RedisURL()
	}
	user := swarmsecret.Get("REDIS_USERNAME_API")
	return redisURLFromUserPass(user, pass, "REDIS_PASSWORD_API")
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
