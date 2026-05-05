package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const resendEmailEndpoint = "https://api.resend.com/emails"

type EmailSender interface {
	SendMagicLink(ctx context.Context, to string, link string) error
}

type MultiEmailSender struct {
	Senders []EmailSender
}

func (sender MultiEmailSender) SendMagicLink(ctx context.Context, to string, link string) error {
	var sendErrors []error
	for _, child := range sender.Senders {
		if err := child.SendMagicLink(ctx, to, link); err != nil {
			sendErrors = append(sendErrors, err)
		}
	}

	if len(sendErrors) > 0 {
		return fmt.Errorf("failed to send magic link: %w", errors.Join(sendErrors...))
	}

	return nil
}

type LogEmailSender struct {
	Writer io.Writer
}

func (sender LogEmailSender) SendMagicLink(_ context.Context, to string, link string) error {
	writer := sender.Writer
	if writer == nil {
		writer = os.Stdout
	}

	_, err := fmt.Fprintf(writer, "Magic login link for %s: %s\n", to, link)
	return err
}

type ResendEmailSender struct {
	APIKey   string
	From     string
	Endpoint string
	Client   *http.Client
}

func (sender ResendEmailSender) SendMagicLink(ctx context.Context, to string, link string) error {
	payload := resendEmailPayload{
		From:    sender.From,
		To:      []string{to},
		Subject: "Sign in to Email Review Tool",
		Text:    magicLinkEmailText(link),
		HTML:    magicLinkEmailHTML(link),
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	endpoint := sender.Endpoint
	if endpoint == "" {
		endpoint = resendEmailEndpoint
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+sender.APIKey)
	request.Header.Set("Content-Type", "application/json")

	client := sender.Client
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}

	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		responseBytes, readErr := io.ReadAll(response.Body)
		if readErr != nil {
			return readErr
		}

		return fmt.Errorf("resend returned %d: %s", response.StatusCode, string(responseBytes))
	}

	return nil
}

type resendEmailPayload struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html"`
	Text    string   `json:"text"`
}

func newMagicLinkEmailSender() EmailSender {
	return MultiEmailSender{Senders: newMagicLinkEmailSendersFromEnv()}
}

func newMagicLinkEmailSendersFromEnv() []EmailSender {
	apiKey := strings.TrimSpace(os.Getenv("RESEND_API_KEY"))
	shouldLog := apiKey == "" || envBoolDefault("AUTH_LOG_MAGIC_LINKS", true)

	var senders []EmailSender
	if apiKey != "" {
		senders = append(senders, ResendEmailSender{
			APIKey: apiKey,
			From:   authFromEmail(),
			Client: &http.Client{Timeout: 15 * time.Second},
		})
	}
	if shouldLog {
		senders = append(senders, LogEmailSender{Writer: os.Stdout})
	}

	return senders
}

func authFromEmail() string {
	fromEmail := strings.TrimSpace(os.Getenv("AUTH_FROM_EMAIL"))
	if fromEmail == "" {
		return "noreply@auth.rubashkin.xyz"
	}

	return fromEmail
}

func envBoolDefault(name string, defaultValue bool) bool {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return defaultValue
	}

	return strings.EqualFold(value, "true") || value == "1"
}

func magicLinkEmailText(link string) string {
	return fmt.Sprintf(`Sign in to Email Review Tool

Open this link to sign in:
%s

This link expires in 15 minutes.

If you did not request this email, you can ignore it.`, link)
}

func magicLinkEmailHTML(link string) string {
	escapedLink := html.EscapeString(link)
	return fmt.Sprintf(`<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
    <h1 style="font-size: 20px;">Sign in to Email Review Tool</h1>
    <p>Open this link to sign in. It expires in 15 minutes.</p>
    <p>
      <a href="%s" style="display: inline-block; padding: 10px 14px; background: #1c7ed6; color: #ffffff; text-decoration: none; border-radius: 6px;">
        Sign in
      </a>
    </p>
    <p>If the button does not work, copy and paste this link into your browser:</p>
    <p><a href="%s">%s</a></p>
    <p>If you did not request this email, you can ignore it.</p>
  </body>
</html>`, escapedLink, escapedLink, escapedLink)
}
