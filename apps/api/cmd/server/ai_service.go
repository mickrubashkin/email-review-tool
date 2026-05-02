package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
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
	htmlCommentPattern = regexp.MustCompile(`(?is)<!--.*?-->`)
	headPattern        = regexp.MustCompile(`(?is)<head\b[^>]*>.*?</head>`)
	stylePattern       = regexp.MustCompile(`(?is)<style\b[^>]*>.*?</style>`)
	scriptPattern      = regexp.MustCompile(`(?is)<script\b[^>]*>.*?</script>`)
	xmlPattern         = regexp.MustCompile(`(?is)<xml\b[^>]*>.*?</xml>`)
	htmlTagPattern     = regexp.MustCompile(`(?is)<[^>]*>`)
	whitespacePattern  = regexp.MustCompile(`\s+`)
	namedEntities      = strings.NewReplacer(
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

type AIAnalysisService struct {
	APIKey           string
	Model            string
	ResponseLanguage string
	ReviewRules      string
	SequenceContext  string
	Client           *http.Client
}

func (service AIAnalysisService) PromptHash() string {
	hash := sha256.Sum256([]byte(strings.Join([]string{
		service.Model,
		service.ResponseLanguage,
		service.ReviewRules,
		service.SequenceContext,
		"email-analysis-schema-v2",
	}, "\x00")))

	return hex.EncodeToString(hash[:])
}

func newAIAnalysisService() (AIAnalysisService, error) {
	reviewRules, err := loadAIContextFile("email_review_rules.md")
	if err != nil {
		return AIAnalysisService{}, err
	}

	sequenceContext, err := loadAIContextFile("onboarding-sequence.md")
	if err != nil {
		return AIAnalysisService{}, err
	}

	model := os.Getenv("OPENAI_MODEL")
	if model == "" {
		model = "gpt-5-nano"
	}
	responseLanguage := os.Getenv("AI_RESPONSE_LANGUAGE")
	if responseLanguage == "" {
		responseLanguage = "Russian"
	}

	return AIAnalysisService{
		APIKey:           os.Getenv("OPENAI_API_KEY"),
		Model:            model,
		ResponseLanguage: responseLanguage,
		ReviewRules:      reviewRules,
		SequenceContext:  sequenceContext,
		Client:           &http.Client{Timeout: 45 * time.Second},
	}, nil
}

func (service AIAnalysisService) AnalyzeEmail(ctx context.Context, email EmailDetail) (AIAnalysisResult, error) {
	startedAt := time.Now()
	metrics := AIAnalysisMetrics{
		Model:  service.Model,
		Status: "error",
	}

	requestBody := map[string]any{
		"model":  service.Model,
		"stream": true,
		"instructions": fmt.Sprintf(strings.TrimSpace(`
You are an email copy reviewer for partner onboarding sequences.
Use the provided review rules and onboarding sequence context.
Review only email text and metadata.
primary_cta is the actual button CTA.
If primary_cta is present, do not infer the main CTA from links or repeated body text.
Use links only as supporting context.
Return only JSON matching the schema.
Write summary, recommendation titles, and details in %s.
Limits:
- summary: 1 short sentence
- score: integer from 1 to 10
- recommendations: max 3
- recommendation details: max 220 characters
`), service.ResponseLanguage),
		"input":             buildEmailAnalysisInput(service.ReviewRules, service.SequenceContext, email),
		"max_output_tokens": 550,
		"text": map[string]any{
			"format": map[string]any{
				"type":        "json_schema",
				"name":        "email_analysis",
				"description": "Email text review result",
				"strict":      true,
				"schema": map[string]any{
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
				},
			},
		},
	}

	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		return AIAnalysisResult{Metrics: finishAIAnalysisMetrics(metrics, startedAt, err)}, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/responses", bytes.NewReader(bodyBytes))
	if err != nil {
		return AIAnalysisResult{Metrics: finishAIAnalysisMetrics(metrics, startedAt, err)}, err
	}
	request.Header.Set("Authorization", "Bearer "+service.APIKey)
	request.Header.Set("Content-Type", "application/json")

	response, err := service.Client.Do(request)
	if err != nil {
		return AIAnalysisResult{Metrics: finishAIAnalysisMetrics(metrics, startedAt, err)}, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		responseBytes, readErr := readOpenAIStreamBody(response.Body)
		if readErr != nil {
			return AIAnalysisResult{Metrics: finishAIAnalysisMetrics(metrics, startedAt, readErr)}, readErr
		}

		err := fmt.Errorf("openai returned %d: %s", response.StatusCode, string(responseBytes))
		return AIAnalysisResult{Metrics: finishAIAnalysisMetrics(metrics, startedAt, err)}, err
	}

	outputText, err := readOpenAIStreamOutputText(response.Body, &metrics, nil)
	if err != nil {
		return AIAnalysisResult{Metrics: finishAIAnalysisMetrics(metrics, startedAt, err)}, err
	}

	var analysis EmailAnalysis
	if err := json.Unmarshal([]byte(extractJSONObject(outputText)), &analysis); err != nil {
		err := fmt.Errorf("failed to parse analysis json: %w", err)
		return AIAnalysisResult{Metrics: finishAIAnalysisMetrics(metrics, startedAt, err)}, err
	}

	metrics.Status = "success"
	return AIAnalysisResult{
		Analysis: analysis,
		Metrics:  finishAIAnalysisMetrics(metrics, startedAt, nil),
	}, nil
}

func analysisStatusSchema() map[string]any {
	return map[string]any{
		"type": "string",
		"enum": []string{"good", "weak", "bad"},
	}
}

func finishAIAnalysisMetrics(metrics AIAnalysisMetrics, startedAt time.Time, err error) AIAnalysisMetrics {
	metrics.LatencyMS = int(time.Since(startedAt).Milliseconds())
	if err != nil {
		message := err.Error()
		metrics.ErrorMessage = &message
	}

	return metrics
}

func applyOpenAIUsage(metrics *AIAnalysisMetrics, responseBytes []byte) {
	var response struct {
		Usage struct {
			InputTokens  *int `json:"input_tokens"`
			OutputTokens *int `json:"output_tokens"`
			TotalTokens  *int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(responseBytes, &response); err != nil {
		return
	}

	metrics.InputTokens = response.Usage.InputTokens
	metrics.OutputTokens = response.Usage.OutputTokens
	metrics.TotalTokens = response.Usage.TotalTokens
}

func readOpenAIStreamBody(body io.Reader) ([]byte, error) {
	return io.ReadAll(body)
}

func readOpenAIStreamOutputText(body io.Reader, metrics *AIAnalysisMetrics, onDelta func(string) error) (string, error) {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 1024), 1024*1024)

	var output strings.Builder
	var finalResponseBytes []byte

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || !strings.HasPrefix(line, "data:") {
			continue
		}

		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}

		var event struct {
			Type     string          `json:"type"`
			Delta    string          `json:"delta"`
			Response json.RawMessage `json:"response"`
			Error    *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		switch event.Type {
		case "response.output_text.delta":
			output.WriteString(event.Delta)
			if onDelta != nil && event.Delta != "" {
				if err := onDelta(event.Delta); err != nil {
					return "", err
				}
			}
		case "response.completed":
			if len(event.Response) > 0 {
				finalResponseBytes = event.Response
			}
		case "error":
			if event.Error != nil && strings.TrimSpace(event.Error.Message) != "" {
				return "", fmt.Errorf("openai stream error: %s", event.Error.Message)
			}
			return "", fmt.Errorf("openai stream error")
		}
	}

	if err := scanner.Err(); err != nil {
		return "", err
	}

	if len(finalResponseBytes) > 0 {
		applyOpenAIUsage(metrics, finalResponseBytes)
	}

	text := strings.TrimSpace(output.String())
	if text == "" && len(finalResponseBytes) > 0 {
		return extractOpenAIOutputText(finalResponseBytes)
	}
	if text == "" {
		return "", fmt.Errorf("openai stream did not include output text")
	}

	return stripMarkdownCodeFence(text), nil
}

func buildEmailAnalysisInput(reviewRules string, sequenceContext string, email EmailDetail) string {
	parts := emailContentParts(email)

	type emailInput struct {
		Subject    string   `json:"subject"`
		Preheader  string   `json:"preheader"`
		BannerText string   `json:"banner_text"`
		PrimaryCTA string   `json:"primary_cta"`
		BodyText   string   `json:"body_text"`
		Links      []string `json:"links"`
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
			Links:      parts.Links,
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

func emailBodyText(email EmailDetail) string {
	if email.BodyText != nil && strings.TrimSpace(*email.BodyText) != "" {
		return *email.BodyText
	}

	return htmlToText(email.OriginalHTML)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}

	return ""
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

func extractJSONObject(text string) string {
	text = strings.TrimSpace(text)
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start == -1 || end == -1 || end < start {
		return text
	}

	return text[start : end+1]
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
			return string(rulesBytes), nil
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
	}

	return "", fmt.Errorf("ai/%s was not found from %s or its parents", fileName, workingDir)
}

func htmlToText(value string) string {
	value = htmlCommentPattern.ReplaceAllString(value, " ")
	value = headPattern.ReplaceAllString(value, " ")
	value = stylePattern.ReplaceAllString(value, " ")
	value = scriptPattern.ReplaceAllString(value, " ")
	value = xmlPattern.ReplaceAllString(value, " ")
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

func (service AIAnalysisService) AnalyzeEmailStream(ctx context.Context, email EmailDetail, onDelta func(string) error) (AIAnalysisResult, error) {
	startedAt := time.Now()
	metrics := AIAnalysisMetrics{
		Model:  service.Model,
		Status: "error",
	}

	requestBody := map[string]any{
		"model":  service.Model,
		"stream": true,
		"instructions": fmt.Sprintf(strings.TrimSpace(`
You are an email copy reviewer for partner onboarding sequences.
Use the provided review rules and onboarding sequence context.
Review only email text and metadata.
primary_cta is the actual button CTA.
If primary_cta is present, do not infer the main CTA from links or repeated body text.
Use links only as supporting context.
Return only JSON matching the schema.
Write summary, recommendation titles, and details in %s.
Limits:
- summary: 1 short sentence
- score: integer from 1 to 10
- recommendations: max 3
- recommendation details: max 220 characters
`), service.ResponseLanguage),
		"input":             buildEmailAnalysisInput(service.ReviewRules, service.SequenceContext, email),
		"max_output_tokens": 550,
		"text": map[string]any{
			"format": map[string]any{
				"type":        "json_schema",
				"name":        "email_analysis",
				"description": "Email text review result",
				"strict":      true,
				"schema": map[string]any{
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
				},
			},
		},
	}

	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		return AIAnalysisResult{Metrics: finishAIAnalysisMetrics(metrics, startedAt, err)}, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/responses", bytes.NewReader(bodyBytes))
	if err != nil {
		return AIAnalysisResult{Metrics: finishAIAnalysisMetrics(metrics, startedAt, err)}, err
	}
	request.Header.Set("Authorization", "Bearer "+service.APIKey)
	request.Header.Set("Content-Type", "application/json")

	response, err := service.Client.Do(request)
	if err != nil {
		return AIAnalysisResult{Metrics: finishAIAnalysisMetrics(metrics, startedAt, err)}, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		responseBytes, readErr := readOpenAIStreamBody(response.Body)
		if readErr != nil {
			return AIAnalysisResult{Metrics: finishAIAnalysisMetrics(metrics, startedAt, readErr)}, readErr
		}

		err := fmt.Errorf("openai returned %d: %s", response.StatusCode, string(responseBytes))
		return AIAnalysisResult{Metrics: finishAIAnalysisMetrics(metrics, startedAt, err)}, err
	}

	outputText, err := readOpenAIStreamOutputText(response.Body, &metrics, onDelta)
	if err != nil {
		return AIAnalysisResult{Metrics: finishAIAnalysisMetrics(metrics, startedAt, err)}, err
	}

	var analysis EmailAnalysis
	if err := json.Unmarshal([]byte(extractJSONObject(outputText)), &analysis); err != nil {
		err := fmt.Errorf("failed to parse AI stream response JSON: %w", err)
		return AIAnalysisResult{Metrics: finishAIAnalysisMetrics(metrics, startedAt, err)}, err
	}

	metrics.Status = "success"
	return AIAnalysisResult{
		Analysis: analysis,
		Metrics:  finishAIAnalysisMetrics(metrics, startedAt, nil),
	}, nil
}
