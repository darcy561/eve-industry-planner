package config

import "eve-industry-planner/shared/core/swarmsecret"

// FeedbackDiscordWebhookURL returns the optional Discord webhook for feedback posts.
func FeedbackDiscordWebhookURL() string {
	return swarmsecret.Get("FEEDBACK_DISCORD_WEBHOOK_URL")
}
