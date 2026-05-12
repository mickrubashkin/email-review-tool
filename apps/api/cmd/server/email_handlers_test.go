package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestListEmailsIncludesOpenCommentCount(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)

	_, err := dbpool.Exec(context.Background(), `
		INSERT INTO comments (
			email_id,
			review_block,
			selected_text,
			start_offset,
			end_offset,
			body,
			status
		)
		VALUES
			($1, 'body-001', 'open comment', 0, 12, 'Open comment body', 'open'),
			($1, 'body-002', 'resolved comment', 0, 16, 'Resolved comment body', 'resolved');
	`, emailID)
	if err != nil {
		t.Fatalf("failed to seed comments: %v", err)
	}

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(http.MethodGet, "/api/emails", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected GET status 200, got %d: %s", response.Code, response.Body.String())
	}

	var emails []EmailListItem
	if err := json.NewDecoder(response.Body).Decode(&emails); err != nil {
		t.Fatalf("failed to decode emails: %v", err)
	}

	for _, email := range emails {
		if email.ID == emailID {
			if email.OpenCommentCount != 1 {
				t.Fatalf("expected open comment count 1, got %d", email.OpenCommentCount)
			}
			return
		}
	}

	t.Fatalf("seed email %s not returned by list emails", emailID)
}

func TestListEmailsExcludesArchivedEmails(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)

	_, err := dbpool.Exec(context.Background(), `
		UPDATE emails
		SET archived_at = now()
		WHERE id = $1;
	`, emailID)
	if err != nil {
		t.Fatalf("failed to archive test email: %v", err)
	}

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(http.MethodGet, "/api/emails", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected GET status 200, got %d: %s", response.Code, response.Body.String())
	}

	var emails []EmailListItem
	if err := json.NewDecoder(response.Body).Decode(&emails); err != nil {
		t.Fatalf("failed to decode emails: %v", err)
	}

	for _, email := range emails {
		if email.ID == emailID {
			t.Fatalf("archived email %s should not be returned by list emails", emailID)
		}
	}
}

func TestUpdateEmailEditableFields(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")
	setTestEmailTemplate(t, dbpool, emailID, `
		<html>
			<body>
				<a
					href="https://example.com/old"
					style="display:block; width: 196px;"
					data-edit-text="primary_cta_text"
					data-edit-attr-href="primary_cta_url"
					data-edit-style-width-px="primary_cta_width_px"
				>Old CTA</a>
			</body>
		</html>
	`)

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	requestBody := []byte(`{
		"editable_fields": {
			"primary_cta_text": { "type": "text", "value": "Start now" },
			"primary_cta_url": { "type": "url", "value": "https://example.com/start" },
			"primary_cta_width_px": { "type": "number", "value": 220 }
		}
	}`)

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/"+emailID+"/editable-fields",
		bytes.NewReader(requestBody),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected PATCH status 204, got %d: %s", response.Code, response.Body.String())
	}

	fields := loadTestEmailEditableFields(t, dbpool, emailID)
	assertEditableField(t, fields, "primary_cta_text", "text", "Start now")
	assertEditableField(t, fields, "primary_cta_url", "url", "https://example.com/start")
	assertEditableField(t, fields, "primary_cta_width_px", "number", float64(220))
}

func TestUpdateEmailEditableFieldsRejectsNullFields(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/"+emailID+"/editable-fields",
		bytes.NewReader([]byte(`{ "editable_fields": null }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected PATCH status 400, got %d: %s", response.Code, response.Body.String())
	}
}

func TestUpdateEmailEditableFieldsRejectsUnsafeURL(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")
	setTestEmailTemplate(t, dbpool, emailID, `
		<html>
			<body>
				<a href="https://example.com/old" data-edit-attr-href="cta_url">CTA</a>
			</body>
		</html>
	`)

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	requestBody := []byte(`{
		"editable_fields": {
			"cta_url": { "type": "url", "value": "javascript:alert(1)" }
		}
	}`)

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/"+emailID+"/editable-fields",
		bytes.NewReader(requestBody),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected PATCH status 400, got %d: %s", response.Code, response.Body.String())
	}

	fields := loadTestEmailEditableFields(t, dbpool, emailID)
	if len(fields) != 0 {
		t.Fatalf("expected editable fields to remain empty, got %#v", fields)
	}
}

func TestUpdateEmailEditableFieldsNotFound(t *testing.T) {
	dbpool := testDBPool(t)
	user := createTestUserWithRole(t, dbpool, "admin")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/00000000-0000-0000-0000-000000000000/editable-fields",
		bytes.NewReader([]byte(`{ "editable_fields": {} }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected PATCH status 404, got %d: %s", response.Code, response.Body.String())
	}
}

func TestDuplicateEmail(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")
	setTestEmailForDuplicate(t, dbpool, emailID)

	_, err := dbpool.Exec(context.Background(), `
		INSERT INTO comments (
			email_id,
			review_block,
			selected_text,
			start_offset,
			end_offset,
			body,
			status
		)
		VALUES ($1, 'body-001', 'selected text', 0, 13, 'Source comment', 'open');
	`, emailID)
	if err != nil {
		t.Fatalf("failed to seed source comment: %v", err)
	}

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	requestBody := []byte(`{
		"language": "ES",
		"variant": "new",
		"title": "Duplicated Email",
		"subject": "Duplicated subject",
		"preheader": "Duplicated preheader"
	}`)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/emails/"+emailID+"/duplicate",
		bytes.NewReader(requestBody),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected POST status 201, got %d: %s", response.Code, response.Body.String())
	}

	var created EmailDetail
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatalf("failed to decode duplicated email: %v", err)
	}
	if created.ID == "" || created.ID == emailID {
		t.Fatalf("expected duplicated email to have a new id, got %q", created.ID)
	}
	t.Cleanup(func() {
		_, _ = dbpool.Exec(context.Background(), `DELETE FROM emails WHERE id = $1;`, created.ID)
	})
	if created.Slug != "comment-test-email-es" {
		t.Fatalf("expected duplicated slug comment-test-email-es, got %q", created.Slug)
	}
	if created.Language != "es" {
		t.Fatalf("expected duplicated language es, got %q", created.Language)
	}
	if created.Variant != "new" {
		t.Fatalf("expected duplicated variant new, got %q", created.Variant)
	}
	if created.Title != "Duplicated Email" {
		t.Fatalf("expected duplicated title override, got %q", created.Title)
	}
	if created.Subject == nil || *created.Subject != "Duplicated subject" {
		t.Fatalf("expected duplicated subject override, got %#v", created.Subject)
	}
	if created.Preheader == nil || *created.Preheader != "Duplicated preheader" {
		t.Fatalf("expected duplicated preheader override, got %#v", created.Preheader)
	}
	assertJSONContainsField(t, created.EditableFields, "primary_cta_text")

	var commentCount int
	err = dbpool.QueryRow(context.Background(), `
		SELECT count(*)::int
		FROM comments
		WHERE email_id = $1;
	`, created.ID).Scan(&commentCount)
	if err != nil {
		t.Fatalf("failed to count duplicated comments: %v", err)
	}
	if commentCount != 0 {
		t.Fatalf("expected duplicated email to have no comments, got %d", commentCount)
	}
}

func TestDuplicateEmailConflict(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")
	setTestEmailForDuplicate(t, dbpool, emailID)
	conflictingID := createTestEmailWithSlug(t, dbpool, "comment-test-email-es")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/emails/"+emailID+"/duplicate",
		bytes.NewReader([]byte(`{ "language": "es", "variant": "new" }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusConflict {
		t.Fatalf("expected POST status 409, got %d: %s", response.Code, response.Body.String())
	}

	var stillExists bool
	err := dbpool.QueryRow(context.Background(), `
		SELECT EXISTS(SELECT 1 FROM emails WHERE id = $1);
	`, conflictingID).Scan(&stillExists)
	if err != nil {
		t.Fatalf("failed to check conflicting email: %v", err)
	}
	if !stillExists {
		t.Fatal("conflicting email should not be modified or deleted")
	}
}

func TestDuplicateEmailNotFound(t *testing.T) {
	dbpool := testDBPool(t)
	user := createTestUserWithRole(t, dbpool, "admin")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/emails/00000000-0000-0000-0000-000000000000/duplicate",
		bytes.NewReader([]byte(`{ "language": "es" }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected POST status 404, got %d: %s", response.Code, response.Body.String())
	}
}

func TestDuplicateEmailRejectsMissingLanguage(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/emails/"+emailID+"/duplicate",
		bytes.NewReader([]byte(`{ "variant": "new" }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected POST status 400, got %d: %s", response.Code, response.Body.String())
	}
}

func TestDuplicateEmailRejectsInvalidVariant(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/emails/"+emailID+"/duplicate",
		bytes.NewReader([]byte(`{ "language": "es", "variant": "draft" }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected POST status 400, got %d: %s", response.Code, response.Body.String())
	}
}

func TestDuplicateEmailRejectsReviewer(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "reviewer")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/emails/"+emailID+"/duplicate",
		bytes.NewReader([]byte(`{ "language": "es" }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected POST status 403, got %d: %s", response.Code, response.Body.String())
	}
}

func TestArchiveEmail(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/"+emailID+"/archive",
		nil,
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected PATCH status 204, got %d: %s", response.Code, response.Body.String())
	}

	var archivedBy string
	err := dbpool.QueryRow(context.Background(), `
		SELECT archived_by
		FROM emails
		WHERE id = $1
			AND archived_at IS NOT NULL;
	`, emailID).Scan(&archivedBy)
	if err != nil {
		t.Fatalf("expected email to be archived: %v", err)
	}
	if archivedBy != user.ID {
		t.Fatalf("expected archived_by %s, got %s", user.ID, archivedBy)
	}
}

func TestArchiveEmailRejectsReviewer(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "reviewer")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/"+emailID+"/archive",
		nil,
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected PATCH status 403, got %d: %s", response.Code, response.Body.String())
	}
}

func setTestEmailTemplate(t *testing.T, dbpool *pgxpool.Pool, emailID string, templateHTML string) {
	t.Helper()

	_, err := dbpool.Exec(context.Background(), `
		UPDATE emails
		SET template_html = $2
		WHERE id = $1;
	`, emailID, templateHTML)
	if err != nil {
		t.Fatalf("failed to update test email template: %v", err)
	}
}

func setTestEmailForDuplicate(t *testing.T, dbpool *pgxpool.Pool, emailID string) {
	t.Helper()

	_, err := dbpool.Exec(context.Background(), `
		UPDATE emails
		SET
			slug = 'comment-test-email-en',
			sequence = 'onboarding',
			title = 'Source Email',
			subject = 'Source subject',
			preheader = 'Source preheader',
			send_timing = 'day 1',
			stage = 'registered',
			sort_order = 10,
			language = 'en',
			variant = 'new',
			body_text = 'Source body text',
			content_parts = '{"subject":"Source subject","preheader":"Source preheader","body_text":"Source body text"}'::jsonb,
			original_html = '<html><body><a href="https://example.com">Old CTA</a></body></html>',
			review_html = '<html><body><a data-review-block="primary_cta" href="https://example.com">Old CTA</a></body></html>',
			template_html = '<html><body><a data-review-block="primary_cta" data-edit-text="primary_cta_text" href="https://example.com">Old CTA</a></body></html>',
			template_hash = 'test-template-hash',
			template_version = 'v1',
			editable_fields = '{"primary_cta_text":{"type":"text","value":"Old CTA"}}'::jsonb
		WHERE id = $1;
	`, emailID)
	if err != nil {
		t.Fatalf("failed to prepare duplicate source email: %v", err)
	}
}

func createTestEmailWithSlug(t *testing.T, dbpool *pgxpool.Pool, slug string) string {
	t.Helper()

	var emailID string
	err := dbpool.QueryRow(context.Background(), `
		INSERT INTO emails (
			slug,
			title,
			stage,
			sort_order,
			language,
			variant,
			original_html,
			review_html,
			template_html,
			editable_fields
		)
		VALUES (
			$1,
			'Conflicting Email',
			'test',
			9998,
			'es',
			'new',
			'<html><body>conflict</body></html>',
			'<html><body><p data-review-block="body-001">conflict</p></body></html>',
			'<html><body><p data-review-block="body-001">conflict</p></body></html>',
			'{}'::jsonb
		)
		RETURNING id;
	`, slug).Scan(&emailID)
	if err != nil {
		t.Fatalf("failed to create conflicting test email: %v", err)
	}

	t.Cleanup(func() {
		_, _ = dbpool.Exec(context.Background(), `DELETE FROM emails WHERE id = $1;`, emailID)
	})

	return emailID
}

func createTestUserWithRole(t *testing.T, dbpool *pgxpool.Pool, role string) AuthUser {
	t.Helper()

	var user AuthUser
	err := dbpool.QueryRow(context.Background(), `
		INSERT INTO users (email, role)
		VALUES ($1, $2)
		ON CONFLICT (email) DO UPDATE SET
			role = EXCLUDED.role,
			updated_at = now()
		RETURNING id, email, role;
	`, "email-handler-"+role+"@example.com", role).Scan(&user.ID, &user.Email, &user.Role)
	if err != nil {
		t.Fatalf("failed to create %s test user: %v", role, err)
	}

	t.Cleanup(func() {
		_, _ = dbpool.Exec(context.Background(), `DELETE FROM users WHERE id = $1;`, user.ID)
	})

	return user
}

func withAuthUser(request *http.Request, user AuthUser) *http.Request {
	return request.WithContext(context.WithValue(request.Context(), authUserContextKey, user))
}

func loadTestEmailEditableFields(t *testing.T, dbpool *pgxpool.Pool, emailID string) map[string]struct {
	Type  string `json:"type"`
	Value any    `json:"value"`
} {
	t.Helper()

	var fieldsJSON []byte
	err := dbpool.QueryRow(context.Background(), `
		SELECT editable_fields
		FROM emails
		WHERE id = $1;
	`, emailID).Scan(&fieldsJSON)
	if err != nil {
		t.Fatalf("failed to load editable fields: %v", err)
	}

	var fields map[string]struct {
		Type  string `json:"type"`
		Value any    `json:"value"`
	}
	if err := json.Unmarshal(fieldsJSON, &fields); err != nil {
		t.Fatalf("failed to decode editable fields: %v", err)
	}

	return fields
}

func assertEditableField(
	t *testing.T,
	fields map[string]struct {
		Type  string `json:"type"`
		Value any    `json:"value"`
	},
	key string,
	fieldType string,
	value any,
) {
	t.Helper()

	field, ok := fields[key]
	if !ok {
		t.Fatalf("field %q is missing", key)
	}
	if field.Type != fieldType {
		t.Fatalf("field %q type = %q, want %q", key, field.Type, fieldType)
	}
	if field.Value != value {
		t.Fatalf("field %q value = %#v, want %#v", key, field.Value, value)
	}
}

func assertJSONContainsField(t *testing.T, raw json.RawMessage, key string) {
	t.Helper()

	var fields map[string]any
	if err := json.Unmarshal(raw, &fields); err != nil {
		t.Fatalf("failed to decode raw JSON fields: %v", err)
	}
	if _, ok := fields[key]; !ok {
		t.Fatalf("expected JSON fields to contain %q, got %#v", key, fields)
	}
}
