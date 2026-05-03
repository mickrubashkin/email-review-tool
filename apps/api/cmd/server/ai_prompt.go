package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const aiAnalysisSchemaVersion = "email-analysis-schema-v2"

func (service AIAnalysisService) PromptHash() string {
	hash := sha256.Sum256([]byte(strings.Join([]string{
		service.Model,
		service.ResponseLanguage,
		service.ReviewRules,
		service.SequenceContext,
		aiAnalysisSchemaVersion,
	}, "\x00")))

	return hex.EncodeToString(hash[:])
}

func (service AIAnalysisService) buildOpenAIAnalysisRequestBody(email EmailDetail) map[string]any {
	return map[string]any{
		"model":             service.Model,
		"stream":            true,
		"instructions":      service.analysisInstructions(),
		"input":             buildEmailAnalysisInput(service.ReviewRules, service.SequenceContext, email),
		"max_output_tokens": 550,
		"text": map[string]any{
			"format": map[string]any{
				"type":        "json_schema",
				"name":        "email_analysis",
				"description": "Email text review result",
				"strict":      true,
				"schema":      emailAnalysisSchema(),
			},
		},
	}
}

func (service AIAnalysisService) analysisInstructions() string {
	return fmt.Sprintf(strings.TrimSpace(`
You are an email copy reviewer for partner onboarding sequences.
Use the provided review rules and onboarding sequence context.
Review only email text and metadata.
primary_cta is the actual button CTA.
If primary_cta is present, do not infer the main CTA from links or repeated body text.
Support links are not competing CTAs when they help complete primary_cta and are phrased as help.
Use support, footer, and other links only as supporting context.
Return only JSON matching the schema.
Write summary, recommendation titles, and details in %s.
Limits:
- summary: 1 short sentence
- score: integer from 1 to 10
- recommendations: max 3
- recommendation details: max 220 characters
`), service.ResponseLanguage)
}

func emailAnalysisSchema() map[string]any {
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"summary", "score", "verdict", "checks", "recommendations"},
		"properties": map[string]any{
			"summary": map[string]any{
				"type":      "string",
				"maxLength": 160,
			},
			"score": map[string]any{
				"type":    "integer",
				"minimum": 1,
				"maximum": 10,
			},
			"verdict": map[string]any{
				"type": "string",
				"enum": []string{"ready", "minor_fixes", "needs_work"},
			},
			"checks": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required": []string{
					"subject",
					"preheader",
					"focus",
					"cta",
					"stage_alignment",
					"readability",
				},
				"properties": map[string]any{
					"subject":         analysisStatusSchema(),
					"preheader":       analysisStatusSchema(),
					"focus":           analysisStatusSchema(),
					"cta":             analysisStatusSchema(),
					"stage_alignment": analysisStatusSchema(),
					"readability":     analysisStatusSchema(),
				},
			},
			"recommendations": map[string]any{
				"type":     "array",
				"maxItems": 3,
				"items": map[string]any{
					"type":                 "object",
					"additionalProperties": false,
					"required":             []string{"priority", "title", "details"},
					"properties": map[string]any{
						"priority": map[string]any{
							"type": "string",
							"enum": []string{"high", "medium", "low"},
						},
						"title": map[string]any{
							"type":      "string",
							"maxLength": 80,
						},
						"details": map[string]any{
							"type":      "string",
							"maxLength": 220,
						},
					},
				},
			},
		},
	}
}

func analysisStatusSchema() map[string]any {
	return map[string]any{
		"type": "string",
		"enum": []string{"good", "weak", "bad"},
	}
}

func buildEmailAnalysisInput(reviewRules string, sequenceContext string, email EmailDetail) string {
	parts := emailContentParts(email)

	type emailInput struct {
		Subject    string     `json:"subject"`
		Preheader  string     `json:"preheader"`
		BannerText string     `json:"banner_text"`
		PrimaryCTA string     `json:"primary_cta"`
		BodyText   string     `json:"body_text"`
		Links      LinkGroups `json:"links"`
	}

	type analysisInput struct {
		Rules            string     `json:"rules"`
		SequenceContext  string     `json:"sequence_context"`
		Stage            string     `json:"stage"`
		Timing           string     `json:"timing"`
		TimingIntent     string     `json:"timing_intent"`
		DeclaredLanguage string     `json:"declared_language"`
		Email            emailInput `json:"email"`
	}

	input := analysisInput{
		Rules:            reviewRules,
		SequenceContext:  sequenceContext,
		Stage:            email.Stage,
		Timing:           stringValue(email.SendTiming),
		TimingIntent:     inferTimingIntent(email.Title, email.SendTiming),
		DeclaredLanguage: email.Language,
		Email: emailInput{
			Subject:    firstNonEmpty(parts.Subject, stringValue(email.Subject)),
			Preheader:  firstNonEmpty(parts.Preheader, stringValue(email.Preheader)),
			BannerText: parts.BannerText,
			PrimaryCTA: parts.PrimaryCTA,
			BodyText:   limitText(firstNonEmpty(parts.BodyText, emailBodyText(email)), 3000),
			Links:      emailLinkGroups(parts),
		},
	}

	inputBytes, err := json.Marshal(input)
	if err != nil {
		return "{}"
	}

	return string(inputBytes)
}

func emailContentParts(email EmailDetail) EmailContentParts {
	if email.ContentParts == nil || strings.TrimSpace(*email.ContentParts) == "" {
		return EmailContentParts{}
	}

	var parts EmailContentParts
	if err := json.Unmarshal([]byte(*email.ContentParts), &parts); err != nil {
		return EmailContentParts{}
	}

	return parts
}

func emailLinkGroups(parts EmailContentParts) LinkGroups {
	if len(parts.LinkGroups.Primary) > 0 ||
		len(parts.LinkGroups.Support) > 0 ||
		len(parts.LinkGroups.Footer) > 0 ||
		len(parts.LinkGroups.Other) > 0 {
		return parts.LinkGroups
	}

	return LinkGroups{Other: parts.Links}
}

func emailBodyText(email EmailDetail) string {
	if email.BodyText != nil && strings.TrimSpace(*email.BodyText) != "" {
		return *email.BodyText
	}

	return htmlToText(email.OriginalHTML)
}

func inferTimingIntent(title string, sendTiming *string) string {
	value := strings.ToLower(title + " " + stringValue(sendTiming))

	switch {
	case strings.Contains(value, "last call") || strings.Contains(value, "last-call") || strings.Contains(value, "14 days"):
		return "last-call"
	case strings.Contains(value, "follow up 2") || strings.Contains(value, "follow-up 2") || strings.Contains(value, "follow-up-2") || strings.Contains(value, "5 days"):
		return "follow-up-2"
	case strings.Contains(value, "follow up 1") || strings.Contains(value, "follow-up 1") || strings.Contains(value, "follow-up-1") || strings.Contains(value, "2 days"):
		return "follow-up-1"
	case strings.Contains(value, "next step") || strings.Contains(value, "next-step") || strings.Contains(value, "immediately"):
		return "next-step"
	default:
		return ""
	}
}

func loadAIContextFile(fileName string) (string, error) {
	workingDir, err := os.Getwd()
	if err != nil {
		return "", err
	}

	for dir := workingDir; ; dir = filepath.Dir(dir) {
		candidates := []string{
			filepath.Join(dir, "ai", fileName),
			filepath.Join(dir, "apps", "api", "ai", fileName),
		}
		for _, candidate := range candidates {
			rulesBytes, err := os.ReadFile(candidate)
			if err != nil && !os.IsNotExist(err) {
				return "", err
			}
			if err == nil {
				return string(rulesBytes), nil
			}
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
	}

	return "", fmt.Errorf("ai/%s was not found from %s or its parents", fileName, workingDir)
}
