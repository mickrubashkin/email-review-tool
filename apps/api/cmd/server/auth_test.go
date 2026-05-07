package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type recordingEmailSender struct {
	calls int
}

func (sender *recordingEmailSender) SendLoginCode(_ context.Context, _ string, _ string) error {
	sender.calls++
	return nil
}

func TestRequestOTPCodeDisallowedDomainDoesNotSendEmail(t *testing.T) {
	t.Setenv("AUTH_ALLOWED_DOMAIN", "alaio.com")

	emailSender := &recordingEmailSender{}
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/auth/request-code",
		strings.NewReader(`{"email":"user@example.com"}`),
	)
	response := httptest.NewRecorder()

	requestOTPCodeHandler(nil, emailSender).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected generic success, got %d", response.Code)
	}
	if emailSender.calls != 0 {
		t.Fatalf("expected email sender not to be called, got %d calls", emailSender.calls)
	}
}

func TestIsAllowedAuthEmailUsesDomainList(t *testing.T) {
	t.Setenv("AUTH_ALLOWED_DOMAIN", "")
	t.Setenv("AUTH_ALLOWED_DOMAINS", "alaio.com, @bitrix24.com, bitrix24.com.br")

	for _, email := range []string{
		"user@alaio.com",
		"user@bitrix24.com",
		"user@bitrix24.com.br",
	} {
		if !isAllowedAuthEmail(email) {
			t.Fatalf("expected %s to be allowed", email)
		}
	}

	if isAllowedAuthEmail("user@example.com") {
		t.Fatalf("expected example.com to be disallowed")
	}
}

func TestIsAllowedAuthEmailFallsBackToSingleDomain(t *testing.T) {
	t.Setenv("AUTH_ALLOWED_DOMAIN", "alaio.com")
	t.Setenv("AUTH_ALLOWED_DOMAINS", "")

	if !isAllowedAuthEmail("user@alaio.com") {
		t.Fatalf("expected configured domain to be allowed")
	}
	if isAllowedAuthEmail("user@bitrix24.com") {
		t.Fatalf("expected unconfigured domain to be disallowed")
	}
}

func TestIsValidOTPCodeFormat(t *testing.T) {
	for _, code := range []string{"123456", "000001"} {
		if !isValidOTPCodeFormat(code) {
			t.Fatalf("expected %s to be valid", code)
		}
	}

	for _, code := range []string{"", "12345", "1234567", "abc123", "12 456"} {
		if isValidOTPCodeFormat(code) {
			t.Fatalf("expected %q to be invalid", code)
		}
	}
}
