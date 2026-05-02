package main

import (
	"strings"

	"github.com/mickrubashkin/email-review-tool/apps/api/internal/emailtext"
)

func htmlToText(value string) string {
	return emailtext.HTMLToText(value)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}

	return ""
}

func limitText(value string, maxLength int) string {
	if len(value) <= maxLength {
		return value
	}

	return strings.TrimSpace(value[:maxLength])
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}

	return *value
}
