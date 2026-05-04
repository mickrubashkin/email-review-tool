package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNewMagicLinkEmailSendersUsesLogFallbackWithoutResendKey(t *testing.T) {
	t.Setenv("RESEND_API_KEY", "")
	t.Setenv("SMTP_HOST", "")
	t.Setenv("AUTH_LOG_MAGIC_LINKS", "false")

	senders := newMagicLinkEmailSendersFromEnv()
	if len(senders) != 1 {
		t.Fatalf("expected one sender, got %d", len(senders))
	}
	if _, ok := senders[0].(LogEmailSender); !ok {
		t.Fatalf("expected log fallback sender, got %#v", senders[0])
	}
}

func TestNewMagicLinkEmailSendersUsesResendWhenConfigured(t *testing.T) {
	t.Setenv("RESEND_API_KEY", "re_test")
	t.Setenv("SMTP_HOST", "")
	t.Setenv("AUTH_FROM_EMAIL", "Email Review Tool <login@alaio.com>")
	t.Setenv("AUTH_LOG_MAGIC_LINKS", "false")

	senders := newMagicLinkEmailSendersFromEnv()
	if len(senders) != 1 {
		t.Fatalf("expected one sender, got %d", len(senders))
	}

	resendSender, ok := senders[0].(ResendEmailSender)
	if !ok {
		t.Fatalf("expected resend sender, got %#v", senders[0])
	}
	if resendSender.APIKey != "re_test" {
		t.Fatalf("expected configured API key")
	}
	if resendSender.From != "Email Review Tool <login@alaio.com>" {
		t.Fatalf("expected configured from email, got %q", resendSender.From)
	}
}

func TestNewMagicLinkEmailSendersCanSendAndLog(t *testing.T) {
	t.Setenv("RESEND_API_KEY", "re_test")
	t.Setenv("SMTP_HOST", "")
	t.Setenv("AUTH_LOG_MAGIC_LINKS", "true")

	senders := newMagicLinkEmailSendersFromEnv()
	if len(senders) != 2 {
		t.Fatalf("expected resend and log senders, got %d", len(senders))
	}
}

func TestNewMagicLinkEmailSendersUsesSMTPWhenConfigured(t *testing.T) {
	t.Setenv("RESEND_API_KEY", "")
	t.Setenv("SMTP_HOST", "smtp.gmail.com")
	t.Setenv("SMTP_PORT", "587")
	t.Setenv("SMTP_USERNAME", "sender@gmail.com")
	t.Setenv("SMTP_PASSWORD", "app-password")
	t.Setenv("AUTH_FROM_EMAIL", "Sender <sender@gmail.com>")
	t.Setenv("AUTH_LOG_MAGIC_LINKS", "false")

	senders := newMagicLinkEmailSendersFromEnv()
	if len(senders) != 1 {
		t.Fatalf("expected one sender, got %d", len(senders))
	}

	smtpSender, ok := senders[0].(SMTPEmailSender)
	if !ok {
		t.Fatalf("expected smtp sender, got %#v", senders[0])
	}
	if smtpSender.Host != "smtp.gmail.com" {
		t.Fatalf("expected smtp host, got %q", smtpSender.Host)
	}
	if smtpSender.Port != 587 {
		t.Fatalf("expected smtp port 587, got %d", smtpSender.Port)
	}
	if smtpSender.Username != "sender@gmail.com" || smtpSender.Password != "app-password" {
		t.Fatalf("expected smtp credentials to be configured")
	}
	if smtpSender.From != "Sender <sender@gmail.com>" {
		t.Fatalf("expected from email, got %q", smtpSender.From)
	}
}

func TestMagicLinkSMTPMessageIncludesTextAndHTML(t *testing.T) {
	link := "https://example.com/auth/callback?token=test"
	message := string(magicLinkSMTPMessage("Sender <sender@gmail.com>", "user@alaio.com", link))

	for _, expected := range []string{
		"From: Sender <sender@gmail.com>",
		"To: user@alaio.com",
		"Subject: Sign in to Email Review Tool",
		"Content-Type: multipart/alternative",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Type: text/html; charset=UTF-8",
		link,
		"Sign in",
	} {
		if !strings.Contains(message, expected) {
			t.Fatalf("expected SMTP message to contain %q, got %q", expected, message)
		}
	}
}

func TestSMTPEnvelopeAddressUsesBareAddress(t *testing.T) {
	if got := smtpEnvelopeAddress("Sender <sender@gmail.com>"); got != "sender@gmail.com" {
		t.Fatalf("expected bare address, got %q", got)
	}

	if got := smtpEnvelopeAddress("sender@gmail.com"); got != "sender@gmail.com" {
		t.Fatalf("expected plain address to stay unchanged, got %q", got)
	}
}

func TestResendEmailSenderSendsMagicLinkPayload(t *testing.T) {
	var receivedPayload resendEmailPayload
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("Authorization") != "Bearer re_test" {
			t.Fatalf("expected bearer auth header, got %q", r.Header.Get("Authorization"))
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Fatalf("expected json content type, got %q", r.Header.Get("Content-Type"))
		}

		if err := json.NewDecoder(r.Body).Decode(&receivedPayload); err != nil {
			t.Fatalf("failed to decode payload: %v", err)
		}

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"email_test"}`))
	}))
	defer server.Close()

	sender := ResendEmailSender{
		APIKey:   "re_test",
		From:     "Email Review Tool <login@alaio.com>",
		Endpoint: server.URL,
		Client:   server.Client(),
	}

	link := "https://example.com/auth/callback?token=test"
	if err := sender.SendMagicLink(context.Background(), "user@alaio.com", link); err != nil {
		t.Fatalf("expected send to succeed, got %v", err)
	}

	if receivedPayload.From != "Email Review Tool <login@alaio.com>" {
		t.Fatalf("expected from email, got %q", receivedPayload.From)
	}
	if len(receivedPayload.To) != 1 || receivedPayload.To[0] != "user@alaio.com" {
		t.Fatalf("expected recipient, got %#v", receivedPayload.To)
	}
	if receivedPayload.Subject != "Sign in to Email Review Tool" {
		t.Fatalf("expected subject, got %q", receivedPayload.Subject)
	}
	if !strings.Contains(receivedPayload.Text, link) {
		t.Fatalf("expected text body to include link, got %q", receivedPayload.Text)
	}
	if !strings.Contains(receivedPayload.HTML, "Sign in") || !strings.Contains(receivedPayload.HTML, link) {
		t.Fatalf("expected html body to include sign-in copy and link, got %q", receivedPayload.HTML)
	}
}

func TestResendEmailSenderReturnsHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "bad sender", http.StatusBadRequest)
	}))
	defer server.Close()

	sender := ResendEmailSender{
		APIKey:   "re_test",
		From:     "Email Review Tool <login@alaio.com>",
		Endpoint: server.URL,
		Client:   server.Client(),
	}

	err := sender.SendMagicLink(context.Background(), "user@alaio.com", "https://example.com")
	if err == nil || !strings.Contains(err.Error(), "resend returned 400") {
		t.Fatalf("expected resend HTTP error, got %v", err)
	}
}
