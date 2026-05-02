package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var (
	htmlTagPattern    = regexp.MustCompile(`(?is)<[^>]*>`)
	whitespacePattern = regexp.MustCompile(`\s+`)
	namedEntities     = strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&#39;", "'",
		"&apos;", "'",
		"&nbsp;", " ",
		"&zwnj;", " ",
		"&ndash;", "-",
		"&mdash;", "-",
	)
)

func analyzeEmailWithOpenAI(ctx context.Context, apiKey string, model string, reviewRules string, sequenceContext string, email EmailDetail) (EmailAnalysis, error) {
	requestBody := map[string]any{
		"model": model,
		"instructions": strings.TrimSpace(`
You are an email review assistant for a partner onboarding workflow.
Analyze only the email text and metadata. Do not review HTML, CSS, layout, rendering, accessibility, or template implementation.
Use the review rules, onboarding sequence context, and common email marketing best practices.
Use the onboarding sequence context only to check stage goal, expected CTA, timing, urgency, and message alignment. Do not summarize the sequence.
Return only valid JSON with this exact shape:
{
  "summary": "one sentence overall assessment",
  "score": 7,
  "recommendations": [
    { "title": "Improve CTA clarity", "details": "specific recommendation under 180 characters" }
  ]
}
Use a score from 1 to 10. Return at most 3 recommendations. Keep every recommendation practical, text-focused, and specific.
`),
		"input": buildEmailAnalysisInput(reviewRules, sequenceContext, email),
	}

	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		return EmailAnalysis{}, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/responses", bytes.NewReader(bodyBytes))
	if err != nil {
		return EmailAnalysis{}, err
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")

	client := http.Client{Timeout: 45 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return EmailAnalysis{}, err
	}
	defer response.Body.Close()

	responseBytes, err := io.ReadAll(response.Body)
	if err != nil {
		return EmailAnalysis{}, err
	}

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return EmailAnalysis{}, fmt.Errorf("openai returned %d: %s", response.StatusCode, string(responseBytes))
	}

	outputText, err := extractOpenAIOutputText(responseBytes)
	if err != nil {
		return EmailAnalysis{}, err
	}

	var analysis EmailAnalysis
	if err := json.Unmarshal([]byte(outputText), &analysis); err != nil {
		return EmailAnalysis{}, fmt.Errorf("failed to parse analysis json: %w", err)
	}

	return analysis, nil
}

func buildEmailAnalysisInput(reviewRules string, sequenceContext string, email EmailDetail) string {
	return fmt.Sprintf(`Review rules:
%s

Onboarding sequence context:
%s

Email metadata:
- Title: %s
- Subject: %s
- Preheader: %s
- Send timing: %s
- Stage: %s
- Language: %s

Email body text:
%s`,
		reviewRules,
		sequenceContext,
		email.Title,
		stringValue(email.Subject),
		stringValue(email.Preheader),
		stringValue(email.SendTiming),
		email.Stage,
		email.Language,
		limitText(htmlToText(email.OriginalHTML), 6000),
	)
}

func limitText(value string, maxLength int) string {
	if len(value) <= maxLength {
		return value
	}

	return strings.TrimSpace(value[:maxLength])
}

func extractOpenAIOutputText(responseBytes []byte) (string, error) {
	var response struct {
		OutputText string `json:"output_text"`
		Output     []struct {
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
	}
	if err := json.Unmarshal(responseBytes, &response); err != nil {
		return "", err
	}

	if strings.TrimSpace(response.OutputText) != "" {
		return strings.TrimSpace(response.OutputText), nil
	}

	var builder strings.Builder
	for _, output := range response.Output {
		for _, content := range output.Content {
			if strings.TrimSpace(content.Text) != "" {
				builder.WriteString(content.Text)
			}
		}
	}

	text := strings.TrimSpace(builder.String())
	if text == "" {
		return "", fmt.Errorf("openai response did not include output text")
	}

	return stripMarkdownCodeFence(text), nil
}

func stripMarkdownCodeFence(text string) string {
	text = strings.TrimSpace(text)
	if !strings.HasPrefix(text, "```") {
		return text
	}

	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```JSON")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")

	return strings.TrimSpace(text)
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
			if err == nil {
				return string(rulesBytes), nil
			}
			if err != nil && !os.IsNotExist(err) {
				return "", err
			}
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
	}

	return "", fmt.Errorf("ai/%s was not found from %s or its parents", fileName, workingDir)
}

func htmlToText(value string) string {
	value = htmlTagPattern.ReplaceAllString(value, " ")
	value = namedEntities.Replace(value)
	value = strings.ReplaceAll(value, "\u200c", " ")
	value = whitespacePattern.ReplaceAllString(value, " ")

	return strings.TrimSpace(value)
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}

	return *value
}
