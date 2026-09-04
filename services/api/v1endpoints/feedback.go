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
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
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
func (a *Handlers) FeedbackHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)

	// Only accept POST requests
	if !helper.RequireMethod(w, r, http.MethodPost) {
		return
	}

	// Optional auth: public middleware binds a valid session cookie; use a sentinel when absent.
	accountID := logs.RequestAccountIDFromContext(ctx)
	if accountID == "" {
		accountID = "loggedOutUser"
	}
	ctx = logs.BindRequestAccountID(ctx, accountID)
	r = r.WithContext(ctx)

	reqBody, err := helper.ExtractRequestBody[FeedbackBody](r)
	if err != nil {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Invalid request: %v", err), "failed to extract feedback body", "feedback_invalid_request", "feedback", err, nil)
		return
	}

	feedbackContent := strings.TrimSpace(reqBody.Response)

	contactName := strings.TrimSpace(reqBody.ContactName)
	if len(contactName) > MaxFeedbackContactField {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("contact_name exceeds maximum length of %d", MaxFeedbackContactField), "feedback contact_name too long", "feedback_contact_name_too_long", "feedback", nil, map[string]any{"length": len(contactName)})
		return
	}

	contactDetails := strings.TrimSpace(reqBody.ContactInfo)
	if len(contactDetails) > MaxFeedbackContactField {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("contact_info exceeds maximum length of %d", MaxFeedbackContactField), "feedback contact_info too long", "feedback_contact_info_too_long", "feedback", nil, map[string]any{"length": len(contactDetails)})
		return
	}

	sentryEventID := strings.TrimSpace(reqBody.SentryEventID)
	if len(sentryEventID) > MaxSentryEventIDLength {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("sentry_event_id exceeds maximum length of %d", MaxSentryEventIDLength), "feedback sentry_event_id too long", "feedback_sentry_event_id_too_long", "feedback", nil, map[string]any{"length": len(sentryEventID)})
		return
	}

	var metadataNorm map[string]string
	if reqBody.Metadata != nil {
		metaJSON, err := json.Marshal(reqBody.Metadata)
		if err != nil {
			helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid metadata", "feedback invalid metadata", "feedback_invalid_metadata", "feedback", err, nil)
			return
		}
		if len(metaJSON) > MaxFeedbackMetadataJSON {
			helper.RespondEndpointError(w, r, http.StatusBadRequest, "metadata too large", "feedback metadata too large", "feedback_metadata_too_large", "feedback", nil, map[string]any{"bytes": len(metaJSON)})
			return
		}
		metadataNorm, err = normalizeFeedbackMetadata(reqBody.Metadata)
		if err != nil {
			helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Invalid metadata: %v", err), "feedback invalid metadata content", "feedback_invalid_metadata_content", "feedback", err, nil)
			return
		}
	}

	if len(feedbackContent) < MinFeedbackLength {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "Feedback content is required", "feedback content too short", "feedback_content_too_short", "feedback", nil, map[string]any{"length": len(feedbackContent)})
		return
	}

	if len(feedbackContent) > MaxFeedbackLength {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Feedback content exceeds maximum length of %d characters", MaxFeedbackLength), "feedback content too long", "feedback_content_too_long", "feedback", nil, map[string]any{"length": len(feedbackContent), "max": MaxFeedbackLength})
		return
	}

	// Validate UTF-8 encoding
	if !utf8.ValidString(feedbackContent) {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "Feedback content contains invalid characters", "feedback content invalid UTF-8", "feedback_content_invalid_utf8", "feedback", nil, nil)
		return
	}

	// Check for suspicious patterns (excessive repetition, potential spam)
	if isSuspiciousContent(feedbackContent) {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid feedback content", "suspicious feedback content detected", "feedback_suspicious_content", "feedback", nil, nil)
		return
	}

	// Sanitise content for Discord (remove control characters)
	sanitizedContent := sanitizeForDiscord(feedbackContent)

	logs.AttachDebugStep(r, "feedback_validated", map[string]any{
		"content_len": len(sanitizedContent),
	})

	// Only send Discord message if feedback content is not blank
	if sanitizedContent != "" {
		if webhookURL := config.FeedbackDiscordWebhookURL(); webhookURL != "" {
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

			payloadJSON, err := json.Marshal(payload)
			if err != nil {
				helper.RespondEndpointServerError(w, r, "Internal server error", "failed to marshal Discord payload", "feedback_marshal_failed", "feedback", err, nil)
				return
			}

			webhookReq, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(payloadJSON))
			if err != nil {
				helper.RespondEndpointServerError(w, r, "Failed to submit feedback", "failed to build Discord webhook request", "feedback_webhook_request_failed", "feedback", err, nil)
				return
			}
			webhookReq.Header.Set("Content-Type", "application/json")

			webhookResp, err := http.DefaultClient.Do(webhookReq)
			if err != nil {
				helper.RespondEndpointServerError(w, r, "Failed to submit feedback", "failed to send Discord webhook", "feedback_webhook_send_failed", "feedback", err, nil)
				return
			}
			defer webhookResp.Body.Close()

			// Check Discord webhook response
			if webhookResp.StatusCode < 200 || webhookResp.StatusCode >= 300 {
				helper.RespondEndpointServerError(w, r, "Failed to submit feedback", "Discord webhook returned error status", "feedback_webhook_status_error", "feedback", fmt.Errorf("discord webhook status %d", webhookResp.StatusCode), map[string]any{"status_code": webhookResp.StatusCode})
				return
			}
			logs.AttachDebugStep(r, "discord_webhook_sent", map[string]any{
				"status_code": webhookResp.StatusCode,
			})
		} else {
			logs.AttachHandlerCaveat(r, "discord_webhook_not_configured", "FEEDBACK_DISCORD_WEBHOOK_URL not configured, skipping Discord notification", nil)
		}
	} else {
		logs.AttachHandlerCaveat(r, "discord_skipped_blank_content", "feedback content is blank, skipping Discord notification", nil)
	}

	logs.AttachHandlerSuccessDetail(r, "feedback submitted", map[string]any{
		"duration_ms": time.Since(start).Milliseconds(),
	})

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
