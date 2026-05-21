package v1endpoints

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
)

const (
	// MaxFeedbackLength is the maximum allowed length for feedback content (5000 characters)
	MaxFeedbackLength = 5000
	// MinFeedbackLength is the minimum required length for feedback content
	MinFeedbackLength = 1
	// MaxFeedbackContactField is the maximum length for optional contact name / contact info
	MaxFeedbackContactField = 200
	// MaxFeedbackMetadataJSON is the maximum size of JSON metadata blob (bytes)
	MaxFeedbackMetadataJSON = 12000
	// MaxFeedbackMetadataKeys caps how many keys the client may send in metadata
	MaxFeedbackMetadataKeys = 64
	// MaxFeedbackMetadataValuePerKey limits each metadata value size (bytes / UTF-8)
	MaxFeedbackMetadataValuePerKey = 4000
	// MaxSentryEventIDLength bounds Sentry user-feedback event id strings
	MaxSentryEventIDLength = 128
)

// FeedbackBody is the JSON body for POST /api/v1/feedback.
//
// Shape (client): response, optional sentry_event_id, optional metadata (map[string]string),
// optional contact_name, optional contact_info (free-form contact).
type FeedbackBody struct {
	Response      string            `json:"response"`
	SentryEventID string            `json:"sentry_event_id,omitempty"`
	Metadata      map[string]string `json:"metadata,omitempty"`
	ContactName   string            `json:"contact_name,omitempty"`
	ContactInfo   string            `json:"contact_info,omitempty"`
}

// DiscordEmbedField represents a field in a Discord embed
type DiscordEmbedField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}

// DiscordEmbed represents a Discord embed message
type DiscordEmbed struct {
	Title  string              `json:"title"`
	Color  int                 `json:"color"`
	Fields []DiscordEmbedField `json:"fields"`
}

// DiscordWebhookPayload represents the payload sent to Discord webhook
type DiscordWebhookPayload struct {
	Username string         `json:"username"`
	Embeds   []DiscordEmbed `json:"embeds"`
}

// FeedbackHandler handles POST /api/v1/feedback.
// Public: rate limit → handler. Optional session cookie is used when present for account label in Discord embeds.
// Client retries: withRequestRetries (408, 429, 5xx).
//
//	405 — not POST
//	400 — invalid JSON, missing/empty response, length limits, invalid metadata
//	500 — JSON marshal or Discord webhook failure
//	200 — success (including when webhook URL is unset)
func FeedbackHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)

	// Only accept POST requests
	if !helper.RequireMethod(w, r, http.MethodPost) {
		logs.WarnCtx(ctx, "invalid method for feedback endpoint")
		return
	}

	// Optional auth: derive account id from session cookie when present.
	accountID := "loggedOutUser"
	if clients != nil && clients.Redis != nil {
		if identity, ok := auth.TryExtractAccountSession(ctx, r, clients.Redis); ok && identity != nil {
			accountID = identity.AccountID
		}
	}

	// Extract request body
	reqBody, err := helper.ExtractRequestBody[FeedbackBody](r)
	if err != nil {
		logs.WarnCtx(ctx, "failed to extract feedback body", "error", err, "account_id", accountID)
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	// Trim whitespace and validate feedback content
	feedbackContent := strings.TrimSpace(reqBody.Response)

	contactName := strings.TrimSpace(reqBody.ContactName)
	if len(contactName) > MaxFeedbackContactField {
		logs.WarnCtx(ctx, "contact_name too long", "account_id", accountID, "length", len(contactName))
		http.Error(w, fmt.Sprintf("contact_name exceeds maximum length of %d", MaxFeedbackContactField), http.StatusBadRequest)
		return
	}

	contactDetails := strings.TrimSpace(reqBody.ContactInfo)
	if len(contactDetails) > MaxFeedbackContactField {
		logs.WarnCtx(ctx, "contact_info too long", "account_id", accountID, "length", len(contactDetails))
		http.Error(w, fmt.Sprintf("contact_info exceeds maximum length of %d", MaxFeedbackContactField), http.StatusBadRequest)
		return
	}

	sentryEventID := strings.TrimSpace(reqBody.SentryEventID)
	if len(sentryEventID) > MaxSentryEventIDLength {
		logs.WarnCtx(ctx, "sentry_event_id too long", "account_id", accountID, "length", len(sentryEventID))
		http.Error(w, fmt.Sprintf("sentry_event_id exceeds maximum length of %d", MaxSentryEventIDLength), http.StatusBadRequest)
		return
	}

	var metadataNorm map[string]string
	if reqBody.Metadata != nil {
		metaJSON, err := json.Marshal(reqBody.Metadata)
		if err != nil {
			logs.WarnCtx(ctx, "invalid metadata", "account_id", accountID, "error", err)
			http.Error(w, "Invalid metadata", http.StatusBadRequest)
			return
		}
		if len(metaJSON) > MaxFeedbackMetadataJSON {
			logs.WarnCtx(ctx, "metadata JSON too large", "account_id", accountID, "bytes", len(metaJSON))
			http.Error(w, "metadata too large", http.StatusBadRequest)
			return
		}
		metadataNorm, err = normalizeFeedbackMetadata(reqBody.Metadata)
		if err != nil {
			logs.WarnCtx(ctx, "invalid metadata content", "account_id", accountID, "error", err)
			http.Error(w, fmt.Sprintf("Invalid metadata: %v", err), http.StatusBadRequest)
			return
		}
	}

	// Validate feedback content length
	if len(feedbackContent) < MinFeedbackLength {
		logs.WarnCtx(ctx, "feedback content too short", "account_id", accountID, "length", len(feedbackContent))
		http.Error(w, "Feedback content is required", http.StatusBadRequest)
		return
	}

	if len(feedbackContent) > MaxFeedbackLength {
		logs.WarnCtx(ctx, "feedback content too long", "account_id", accountID, "length", len(feedbackContent), "max", MaxFeedbackLength)
		http.Error(w, fmt.Sprintf("Feedback content exceeds maximum length of %d characters", MaxFeedbackLength), http.StatusBadRequest)
		return
	}

	// Validate UTF-8 encoding
	if !utf8.ValidString(feedbackContent) {
		logs.WarnCtx(ctx, "feedback content contains invalid UTF-8", "account_id", accountID)
		http.Error(w, "Feedback content contains invalid characters", http.StatusBadRequest)
		return
	}

	// Check for suspicious patterns (excessive repetition, potential spam)
	if isSuspiciousContent(feedbackContent) {
		logs.WarnCtx(ctx, "suspicious feedback content detected", "account_id", accountID)
		http.Error(w, "Invalid feedback content", http.StatusBadRequest)
		return
	}

	// Sanitize content for Discord (remove control characters)
	sanitizedContent := sanitizeForDiscord(feedbackContent)

	// Only send Discord message if feedback content is not blank
	if sanitizedContent != "" {
		// Get Discord webhook URL from config
		cfg, err := config.LoadConfig()
		if err != nil {
			// Log error but continue without Discord webhook
			logs.ErrorCtx(ctx, "failed to load config for feedback", "error", err, "account_id", accountID)
		} else if cfg.FeedbackDiscordWebhookURL != "" {
			// Split content into multiple embeds if needed (Discord field max is 1024 chars)
			contentParts := splitContentForDiscord(sanitizedContent, 1024)

			// Create embeds - first one has AccountID, all have content parts
			embeds := make([]DiscordEmbed, 0, len(contentParts))

			for i, part := range contentParts {
				fields := []DiscordEmbedField{}

				// Add AccountID only to the first embed
				if i == 0 {
					fields = append(fields, DiscordEmbedField{
						Name:   "AccountID",
						Value:  accountID,
						Inline: false,
					})
					if sentryEventID != "" {
						fields = append(fields, DiscordEmbedField{
							Name:   "Sentry event id",
							Value:  truncateDiscordField(sentryEventID),
							Inline: false,
						})
					}
					if contactName != "" {
						fields = append(fields, DiscordEmbedField{
							Name:   "Contact name",
							Value:  truncateDiscordField(contactName),
							Inline: true,
						})
					}
					if contactDetails != "" {
						fields = append(fields, DiscordEmbedField{
							Name:   "Contact",
							Value:  truncateDiscordField(contactDetails),
							Inline: true,
						})
					}
					if len(metadataNorm) > 0 {
						fields = append(fields, DiscordEmbedField{
							Name:   "Client context",
							Value:  truncateDiscordField(formatFeedbackMetadataForDiscord(metadataNorm)),
							Inline: false,
						})
					}
				}

				// Add content part with part number if multiple parts
				fieldName := "Feedback Content"
				if len(contentParts) > 1 {
					fieldName = fmt.Sprintf("Feedback Content (Part %d/%d)", i+1, len(contentParts))
				}

				fields = append(fields, DiscordEmbedField{
					Name:   fieldName,
					Value:  part,
					Inline: false,
				})

				embeds = append(embeds, DiscordEmbed{
					Title:  "New Feedback",
					Color:  0x3D85C6, // #3D85C6 in decimal
					Fields: fields,
				})
			}

			payload := DiscordWebhookPayload{
				Username: "Feedback Webhook",
				Embeds:   embeds,
			}

			// Marshal payload to JSON
			payloadJSON, err := json.Marshal(payload)
			if err != nil {
				helper.RespondEndpointServerError(w, r, "Internal server error", "failed to marshal Discord payload", "feedback_marshal_failed", "feedback", err, map[string]interface{}{"account_id": accountID})
				return
			}

			webhookReq, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.FeedbackDiscordWebhookURL, bytes.NewReader(payloadJSON))
			if err != nil {
				helper.RespondEndpointServerError(w, r, "Failed to submit feedback", "failed to build Discord webhook request", "feedback_webhook_request_failed", "feedback", err, map[string]interface{}{"account_id": accountID})
				return
			}
			webhookReq.Header.Set("Content-Type", "application/json")

			webhookResp, err := http.DefaultClient.Do(webhookReq)
			if err != nil {
				helper.RespondEndpointServerError(w, r, "Failed to submit feedback", "failed to send Discord webhook", "feedback_webhook_send_failed", "feedback", err, map[string]interface{}{"account_id": accountID})
				return
			}
			defer webhookResp.Body.Close()

			// Check Discord webhook response
			if webhookResp.StatusCode < 200 || webhookResp.StatusCode >= 300 {
				helper.RespondEndpointServerError(w, r, "Failed to submit feedback", "Discord webhook returned error status", "feedback_webhook_status_error", "feedback", fmt.Errorf("discord webhook status %d", webhookResp.StatusCode), map[string]interface{}{"account_id": accountID, "status_code": webhookResp.StatusCode})
				return
			}
		} else {
			logs.WarnCtx(ctx, "FEEDBACK_DISCORD_WEBHOOK_URL not configured, skipping Discord notification", "account_id", accountID)
		}
	} else {
		logs.InfoCtx(ctx, "feedback content is blank, skipping Discord notification", "account_id", accountID)
	}

	logs.InfoCtx(ctx, "feedback submitted", "account_id", accountID, "duration_ms", time.Since(start).Milliseconds())

	// Return success status code
	w.WriteHeader(http.StatusOK)
}

// isSuspiciousContent checks for suspicious patterns in feedback content
// Returns true if content appears to be spam or malicious
func isSuspiciousContent(content string) bool {
	// Check for excessive repetition (potential spam)
	if len(content) > 100 {
		// Check for repeated character sequences (more than 50% repetition)
		runes := []rune(content)
		if len(runes) > 0 {
			repetitionCount := 0
			for i := 1; i < len(runes) && i < 100; i++ {
				if runes[i] == runes[i-1] {
					repetitionCount++
				}
			}
			// If more than 50% of characters are repeated, it's suspicious
			if float64(repetitionCount)/float64(len(runes)) > 0.5 {
				return true
			}
		}

		// Check for excessive URL-like patterns (potential spam)
		urlCount := strings.Count(content, "http://") + strings.Count(content, "https://") + strings.Count(content, "www.")
		if urlCount > 5 {
			return true
		}
	}

	// Check for excessive whitespace (potential DoS)
	if strings.Count(content, " ") > len(content)/2 {
		return true
	}

	return false
}

// sanitizeForDiscord sanitizes content for Discord by removing control characters
// Does not truncate - splitting is handled separately
func sanitizeForDiscord(content string) string {
	// Remove null bytes and control characters (except newlines and tabs)
	var sanitized strings.Builder
	for _, r := range content {
		// Allow printable characters, newlines, and tabs
		if r == '\n' || r == '\t' || (r >= 32 && r != 127) {
			sanitized.WriteRune(r)
		}
	}

	return sanitized.String()
}

func normalizeFeedbackMetadata(m map[string]string) (map[string]string, error) {
	if m == nil {
		return nil, nil
	}
	if len(m) > MaxFeedbackMetadataKeys {
		return nil, fmt.Errorf("too many keys (max %d)", MaxFeedbackMetadataKeys)
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		if len(k) > 128 {
			return nil, fmt.Errorf("metadata key too long")
		}
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		if len(v) > MaxFeedbackMetadataValuePerKey {
			return nil, fmt.Errorf("metadata value for key %q exceeds maximum length", k)
		}
		out[k] = v
	}
	return out, nil
}

const discordEmbedFieldMaxRunes = 1024

func truncateDiscordField(s string) string {
	r := []rune(s)
	if len(r) <= discordEmbedFieldMaxRunes {
		return s
	}
	return string(r[:discordEmbedFieldMaxRunes-1]) + "…"
}

func formatFeedbackMetadataForDiscord(m map[string]string) string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, k := range keys {
		v := m[k]
		if b.Len() > 0 {
			b.WriteString("\n")
		}
		b.WriteString(k)
		b.WriteString(": ")
		b.WriteString(v)
		if b.Len() > 3500 {
			break
		}
	}
	return b.String()
}

// splitContentForDiscord splits content into parts that fit Discord embed field limits
// Respects word boundaries and ensures valid UTF-8
// maxLength is the maximum length per part (1024 for Discord embed field values)
func splitContentForDiscord(content string, maxLength int) []string {
	if len(content) <= maxLength {
		return []string{content}
	}

	var parts []string
	remaining := content

	for len(remaining) > 0 {
		if len(remaining) <= maxLength {
			parts = append(parts, remaining)
			break
		}

		// Try to find a word boundary near the max length
		cutPoint := maxLength

		// Look backwards for a space, newline, or tab (word boundary)
		for i := cutPoint; i > maxLength-100 && i > 0; i-- {
			if remaining[i] == ' ' || remaining[i] == '\n' || remaining[i] == '\t' {
				cutPoint = i + 1 // Include the space/newline/tab
				break
			}
		}

		// Extract the part
		part := remaining[:cutPoint]

		// Ensure valid UTF-8 by trimming from the end if needed
		for len(part) > 0 && !utf8.ValidString(part) {
			part = part[:len(part)-1]
		}

		parts = append(parts, strings.TrimSpace(part))
		remaining = strings.TrimSpace(remaining[cutPoint:])
	}

	return parts
}
