package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"os"
	"strconv"
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

type SMTPEmailSender struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
	TLS      bool
}

func (sender SMTPEmailSender) SendMagicLink(_ context.Context, to string, link string) error {
	if sender.useImplicitTLS() {
		return sender.sendMagicLinkWithImplicitTLS(to, link)
	}

	address := sender.smtpAddress()
	auth := smtp.PlainAuth("", sender.Username, sender.Password, sender.Host)
	return smtp.SendMail(address, auth, smtpEnvelopeAddress(sender.From), []string{to}, magicLinkSMTPMessage(sender.From, to, link))
}

func (sender SMTPEmailSender) sendMagicLinkWithImplicitTLS(to string, link string) error {
	connection, err := tlsDialWithTimeout("tcp", sender.smtpAddress(), 15*time.Second)
	if err != nil {
		return err
	}
	defer connection.Close()

	client, err := smtp.NewClient(connection, sender.Host)
	if err != nil {
		return err
	}
	defer client.Close()

	auth := smtp.PlainAuth("", sender.Username, sender.Password, sender.Host)
	if err := client.Auth(auth); err != nil {
		return err
	}
	if err := client.Mail(smtpEnvelopeAddress(sender.From)); err != nil {
		return err
	}
	if err := client.Rcpt(to); err != nil {
		return err
	}

	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write(magicLinkSMTPMessage(sender.From, to, link)); err != nil {
		_ = writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}

	return client.Quit()
}

func (sender SMTPEmailSender) useImplicitTLS() bool {
	return sender.TLS || sender.Port == 465
}

func (sender SMTPEmailSender) smtpAddress() string {
	port := sender.Port
	if port == 0 {
		port = 587
	}

	return fmt.Sprintf("%s:%d", sender.Host, port)
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
	smtpHost := strings.TrimSpace(os.Getenv("SMTP_HOST"))
	shouldLog := (apiKey == "" && smtpHost == "") || envBoolDefault("AUTH_LOG_MAGIC_LINKS", true)

	var senders []EmailSender
	if smtpHost != "" {
		senders = append(senders, SMTPEmailSender{
			Host:     smtpHost,
			Port:     smtpPort(),
			Username: strings.TrimSpace(os.Getenv("SMTP_USERNAME")),
			Password: strings.TrimSpace(os.Getenv("SMTP_PASSWORD")),
			From:     authFromEmail(),
			TLS:      envBoolDefault("SMTP_TLS", false),
		})
	}
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

func smtpPort() int {
	portText := strings.TrimSpace(os.Getenv("SMTP_PORT"))
	if portText == "" {
		return 587
	}

	port, err := strconv.Atoi(portText)
	if err != nil || port <= 0 {
		return 587
	}

	return port
}

func tlsDialWithTimeout(network string, address string, timeout time.Duration) (net.Conn, error) {
	dialer := &net.Dialer{Timeout: timeout}
	return tls.DialWithDialer(dialer, network, address, nil)
}

func smtpEnvelopeAddress(value string) string {
	address, err := mail.ParseAddress(value)
	if err != nil {
		return strings.TrimSpace(value)
	}

	return address.Address
}

func authFromEmail() string {
	fromEmail := strings.TrimSpace(os.Getenv("AUTH_FROM_EMAIL"))
	if fromEmail == "" {
		return "Email Review Tool <login@alaio.com>"
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

func magicLinkSMTPMessage(from string, to string, link string) []byte {
	textBody := magicLinkEmailText(link)
	htmlBody := magicLinkEmailHTML(link)
	boundary := "email-review-tool-magic-link"
	message := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: Sign in to Email Review Tool\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=%q\r\n\r\n--%s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n\r\n--%s\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s\r\n\r\n--%s--\r\n",
		from,
		to,
		boundary,
		boundary,
		textBody,
		boundary,
		htmlBody,
		boundary,
	)

	return []byte(message)
}
