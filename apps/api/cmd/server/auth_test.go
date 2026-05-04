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

func (sender *recordingEmailSender) SendMagicLink(_ context.Context, _ string, _ string) error {
	sender.calls++
	return nil
}

func TestRequestMagicLinkDisallowedDomainDoesNotSendEmail(t *testing.T) {
	t.Setenv("AUTH_ALLOWED_DOMAIN", "alaio.com")

	emailSender := &recordingEmailSender{}
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/auth/request-link",
		strings.NewReader(`{"email":"user@example.com"}`),
	)
	response := httptest.NewRecorder()

	requestMagicLinkHandler(nil, emailSender).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected generic success, got %d", response.Code)
	}
	if emailSender.calls != 0 {
		t.Fatalf("expected email sender not to be called, got %d calls", emailSender.calls)
	}
}
