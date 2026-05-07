package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNewLoginCodeEmailSendersUsesLogFallbackWithoutResendKey(t *testing.T) {
	t.Setenv("RESEND_API_KEY", "")
	t.Setenv("AUTH_LOG_LOGIN_CODES", "false")

	senders := newLoginCodeEmailSendersFromEnv()
	if len(senders) != 1 {
		t.Fatalf("expected one sender, got %d", len(senders))
	}
	if _, ok := senders[0].(LogEmailSender); !ok {
		t.Fatalf("expected log fallback sender, got %#v", senders[0])
	}
}

func TestNewLoginCodeEmailSendersUsesResendWhenConfigured(t *testing.T) {
	t.Setenv("RESEND_API_KEY", "re_test")
	t.Setenv("AUTH_FROM_EMAIL", "Email Review Tool <login@alaio.com>")
	t.Setenv("AUTH_LOG_LOGIN_CODES", "false")

	senders := newLoginCodeEmailSendersFromEnv()
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

func TestNewLoginCodeEmailSendersCanSendAndLog(t *testing.T) {
	t.Setenv("RESEND_API_KEY", "re_test")
	t.Setenv("AUTH_LOG_LOGIN_CODES", "true")

	senders := newLoginCodeEmailSendersFromEnv()
	if len(senders) != 2 {
		t.Fatalf("expected resend and log senders, got %d", len(senders))
	}
}

func TestResendEmailSenderSendsLoginCodePayload(t *testing.T) {
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

	code := "123456"
	if err := sender.SendLoginCode(context.Background(), "user@alaio.com", code); err != nil {
		t.Fatalf("expected send to succeed, got %v", err)
	}

	if receivedPayload.From != "Email Review Tool <login@alaio.com>" {
		t.Fatalf("expected from email, got %q", receivedPayload.From)
	}
	if len(receivedPayload.To) != 1 || receivedPayload.To[0] != "user@alaio.com" {
		t.Fatalf("expected recipient, got %#v", receivedPayload.To)
	}
	if receivedPayload.Subject != "Your ReviewDesk sign-in code" {
		t.Fatalf("expected subject, got %q", receivedPayload.Subject)
	}
	if !strings.Contains(receivedPayload.Text, code) {
		t.Fatalf("expected text body to include code, got %q", receivedPayload.Text)
	}
	if !strings.Contains(receivedPayload.HTML, "Sign in") || !strings.Contains(receivedPayload.HTML, code) {
		t.Fatalf("expected html body to include sign-in copy and code, got %q", receivedPayload.HTML)
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

	err := sender.SendLoginCode(context.Background(), "user@alaio.com", "123456")
	if err == nil || !strings.Contains(err.Error(), "resend returned 400") {
		t.Fatalf("expected resend HTTP error, got %v", err)
	}
}
