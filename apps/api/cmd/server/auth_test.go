package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
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

func TestListAdminUsersRequiresSuperAdmin(t *testing.T) {
	dbpool := testDBPool(t)
	user := createTestUserWithRole(t, dbpool, "admin")

	router := chi.NewRouter()
	registerAuthRoutes(router, dbpool, &recordingEmailSender{})

	request := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected GET status 403, got %d: %s", response.Code, response.Body.String())
	}
}

func TestSuperAdminCanListAndUpdateUsers(t *testing.T) {
	dbpool := testDBPool(t)
	superAdmin := createTestUserWithRole(t, dbpool, "super_admin")
	reviewer := createTestUserWithRole(t, dbpool, "reviewer")

	router := chi.NewRouter()
	registerAuthRoutes(router, dbpool, &recordingEmailSender{})

	listRequest := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	listRequest = withAuthUser(listRequest, superAdmin)
	listResponse := httptest.NewRecorder()
	router.ServeHTTP(listResponse, listRequest)

	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected GET status 200, got %d: %s", listResponse.Code, listResponse.Body.String())
	}

	var users []UserAdminItem
	if err := json.NewDecoder(listResponse.Body).Decode(&users); err != nil {
		t.Fatalf("failed to decode users: %v", err)
	}
	if len(users) == 0 {
		t.Fatal("expected users list to include test users")
	}

	updateRequest := httptest.NewRequest(
		http.MethodPatch,
		"/api/admin/users/"+reviewer.ID+"/role",
		bytes.NewReader([]byte(`{ "role": "admin" }`)),
	)
	updateRequest = withAuthUser(updateRequest, superAdmin)
	updateResponse := httptest.NewRecorder()
	router.ServeHTTP(updateResponse, updateRequest)

	if updateResponse.Code != http.StatusOK {
		t.Fatalf("expected PATCH status 200, got %d: %s", updateResponse.Code, updateResponse.Body.String())
	}

	var updated UserAdminItem
	if err := json.NewDecoder(updateResponse.Body).Decode(&updated); err != nil {
		t.Fatalf("failed to decode updated user: %v", err)
	}
	if updated.ID != reviewer.ID || updated.Role != "admin" {
		t.Fatalf("expected reviewer to become admin, got %#v", updated)
	}
}

func TestSuperAdminCannotDemoteSelf(t *testing.T) {
	dbpool := testDBPool(t)
	superAdmin := createTestUserWithRole(t, dbpool, "super_admin")

	router := chi.NewRouter()
	registerAuthRoutes(router, dbpool, &recordingEmailSender{})

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/admin/users/"+superAdmin.ID+"/role",
		bytes.NewReader([]byte(`{ "role": "admin" }`)),
	)
	request = withAuthUser(request, superAdmin)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected PATCH status 400, got %d: %s", response.Code, response.Body.String())
	}
}
