package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mickrubashkin/email-review-tool/apps/api/internal/emailedit"
	"github.com/mickrubashkin/email-review-tool/apps/api/internal/emailtext"
)

func registerEmailRoutes(r chi.Router, dbpool *pgxpool.Pool) {
	r.Get("/api/emails", listEmailsHandler(dbpool))
	r.Get("/api/emails/{id}", getEmailHandler(dbpool))
	r.Patch("/api/emails/{id}/editable-fields", updateEmailEditableFieldsHandler(dbpool))
	r.Post("/api/emails/{id}/duplicate", duplicateEmailHandler(dbpool))
	r.Patch("/api/emails/{id}/archive", archiveEmailHandler(dbpool))
}

func listEmailsHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := dbpool.Query(r.Context(), `
			SELECT
				id,
				sequence,
				title,
				subject,
				preheader,
				send_timing,
				stage,
				sort_order,
				language,
				variant,
				(
					SELECT count(*)::int
					FROM comments
					WHERE comments.email_id = emails.id
						AND comments.status = 'open'
					) AS open_comment_count
			FROM emails
			WHERE archived_at IS NULL
			ORDER BY sort_order, created_at;
		`)
		if err != nil {
			http.Error(w, "failed to load emails", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		emails := []EmailListItem{}

		for rows.Next() {
			var email EmailListItem

			err := rows.Scan(
				&email.ID,
				&email.Sequence,
				&email.Title,
				&email.Subject,
				&email.Preheader,
				&email.SendTiming,
				&email.Stage,
				&email.SortOrder,
				&email.Language,
				&email.Variant,
				&email.OpenCommentCount,
			)
			if err != nil {
				fmt.Fprintf(os.Stderr, "failed to scan email row: %v\n", err)
				http.Error(w, "failed to read emails", http.StatusInternalServerError)
				return
			}

			emails = append(emails, email)
		}

		if err := rows.Err(); err != nil {
			http.Error(w, "failed to read emails", http.StatusInternalServerError)
			return
		}

		_ = json.NewEncoder(w).Encode(emails)
	}
}

func getEmailHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		var email EmailDetail
		var editableFields []byte

		err := dbpool.QueryRow(r.Context(), `
			SELECT
				id,
				slug,
				sequence,
				title,
				subject,
				preheader,
				send_timing,
				stage,
				sort_order,
				language,
				variant,
				(
					SELECT count(*)::int
					FROM comments
					WHERE comments.email_id = emails.id
						AND comments.status = 'open'
				) AS open_comment_count,
				original_html,
				review_html,
				template_html,
				template_hash,
				template_version,
				editable_fields
			FROM emails
			WHERE id = $1;
		`, id).Scan(
			&email.ID,
			&email.Slug,
			&email.Sequence,
			&email.Title,
			&email.Subject,
			&email.Preheader,
			&email.SendTiming,
			&email.Stage,
			&email.SortOrder,
			&email.Language,
			&email.Variant,
			&email.OpenCommentCount,
			&email.OriginalHTML,
			&email.ReviewHTML,
			&email.TemplateHTML,
			&email.TemplateHash,
			&email.TemplateVersion,
			&editableFields,
		)

		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to get email %s: %v\n", id, err)
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		email.EditableFields = json.RawMessage(editableFields)

		_ = json.NewEncoder(w).Encode(email)
	}
}

type updateEmailEditableFieldsRequest struct {
	EditableFields emailedit.EditableFields `json:"editable_fields"`
}

func updateEmailEditableFieldsHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if !isRequestAdmin(r) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		var request updateEmailEditableFieldsRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if request.EditableFields == nil {
			http.Error(w, "editable_fields is required", http.StatusBadRequest)
			return
		}

		var templateHTML string
		err := dbpool.QueryRow(r.Context(), `
			SELECT template_html
			FROM emails
			WHERE id = $1
				AND archived_at IS NULL;
		`, id).Scan(&templateHTML)
		if err != nil {
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		if _, err := emailedit.RenderEditableHTML(templateHTML, request.EditableFields); err != nil {
			fmt.Fprintf(os.Stderr, "invalid editable fields for email %s: %v\n", id, err)
			http.Error(w, "invalid editable fields", http.StatusBadRequest)
			return
		}

		fieldsJSON, err := request.EditableFields.JSON()
		if err != nil {
			http.Error(w, "invalid editable fields", http.StatusBadRequest)
			return
		}

		result, err := dbpool.Exec(r.Context(), `
			UPDATE emails
			SET editable_fields = $2::jsonb,
				updated_at = now()
			WHERE id = $1
				AND archived_at IS NULL;
		`, id, fieldsJSON)
		if err != nil {
			http.Error(w, "failed to update editable fields", http.StatusInternalServerError)
			return
		}
		if result.RowsAffected() == 0 {
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

type duplicateEmailRequest struct {
	Language  string  `json:"language"`
	Variant   *string `json:"variant"`
	Title     *string `json:"title"`
	Subject   *string `json:"subject"`
	Preheader *string `json:"preheader"`
}

func duplicateEmailHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if !isRequestAdmin(r) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		var request duplicateEmailRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		language := strings.ToLower(strings.TrimSpace(request.Language))
		if language == "" {
			http.Error(w, "language is required", http.StatusBadRequest)
			return
		}

		source, err := loadEmailForDuplicate(r, dbpool, id)
		if err != nil {
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		variant := source.Variant
		if request.Variant != nil {
			variant = strings.ToLower(strings.TrimSpace(*request.Variant))
		}
		if variant != "new" && variant != "old" {
			http.Error(w, "variant must be new or old", http.StatusBadRequest)
			return
		}

		title := source.Title
		if request.Title != nil {
			title = strings.TrimSpace(*request.Title)
		}
		if title == "" {
			http.Error(w, "title is required", http.StatusBadRequest)
			return
		}

		subject := source.Subject
		if request.Subject != nil {
			subject = request.Subject
		}

		preheader := source.Preheader
		if request.Preheader != nil {
			preheader = request.Preheader
		}

		slug := duplicateEmailSlug(source.Slug, source.Language, language, variant)
		contentParts, err := json.Marshal(emailtext.ExtractContentParts(
			source.OriginalHTML,
			stringFromPointer(subject),
			stringFromPointer(preheader),
			stringFromPointer(source.BodyText),
		))
		if err != nil {
			http.Error(w, "failed to build duplicated email", http.StatusInternalServerError)
			return
		}

		created, err := insertDuplicatedEmail(r, dbpool, duplicateEmailInsert{
			Slug:            slug,
			Sequence:        source.Sequence,
			Title:           title,
			Subject:         subject,
			Preheader:       preheader,
			SendTiming:      source.SendTiming,
			Stage:           source.Stage,
			SortOrder:       source.SortOrder,
			Language:        language,
			Variant:         variant,
			BodyText:        source.BodyText,
			ContentParts:    contentParts,
			OriginalHTML:    source.OriginalHTML,
			ReviewHTML:      source.ReviewHTML,
			TemplateHTML:    source.TemplateHTML,
			TemplateHash:    source.TemplateHash,
			TemplateVersion: source.TemplateVersion,
			EditableFields:  source.EditableFields,
		})
		if err != nil {
			if isEmailSlugConflict(err) {
				http.Error(w, "email duplicate already exists", http.StatusConflict)
				return
			}
			fmt.Fprintf(os.Stderr, "failed to duplicate email %s: %v\n", id, err)
			http.Error(w, "failed to duplicate email", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(created)
	}
}

func archiveEmailHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		user, ok := authUserFromContext(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if !isAdminUser(user) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		result, err := dbpool.Exec(r.Context(), `
			UPDATE emails
			SET archived_at = now(),
				archived_by = $2,
				updated_at = now()
			WHERE id = $1
				AND archived_at IS NULL;
		`, id, user.ID)
		if err != nil {
			http.Error(w, "failed to archive email", http.StatusInternalServerError)
			return
		}
		if result.RowsAffected() == 0 {
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func isRequestAdmin(r *http.Request) bool {
	user, ok := authUserFromContext(r)
	return ok && isAdminUser(user)
}

type emailDuplicateSource struct {
	Slug            string
	Sequence        string
	Title           string
	Subject         *string
	Preheader       *string
	SendTiming      *string
	Stage           string
	SortOrder       int
	Language        string
	Variant         string
	BodyText        *string
	OriginalHTML    string
	ReviewHTML      *string
	TemplateHTML    string
	TemplateHash    *string
	TemplateVersion *string
	EditableFields  []byte
}

func loadEmailForDuplicate(r *http.Request, dbpool *pgxpool.Pool, id string) (emailDuplicateSource, error) {
	var source emailDuplicateSource
	err := dbpool.QueryRow(r.Context(), `
		SELECT
			slug,
			sequence,
			title,
			subject,
			preheader,
			send_timing,
			stage,
			sort_order,
			language,
			variant,
			body_text,
			original_html,
			review_html,
			template_html,
			template_hash,
			template_version,
			editable_fields
		FROM emails
		WHERE id = $1
			AND archived_at IS NULL;
	`, id).Scan(
		&source.Slug,
		&source.Sequence,
		&source.Title,
		&source.Subject,
		&source.Preheader,
		&source.SendTiming,
		&source.Stage,
		&source.SortOrder,
		&source.Language,
		&source.Variant,
		&source.BodyText,
		&source.OriginalHTML,
		&source.ReviewHTML,
		&source.TemplateHTML,
		&source.TemplateHash,
		&source.TemplateVersion,
		&source.EditableFields,
	)

	return source, err
}

type duplicateEmailInsert struct {
	Slug            string
	Sequence        string
	Title           string
	Subject         *string
	Preheader       *string
	SendTiming      *string
	Stage           string
	SortOrder       int
	Language        string
	Variant         string
	BodyText        *string
	ContentParts    []byte
	OriginalHTML    string
	ReviewHTML      *string
	TemplateHTML    string
	TemplateHash    *string
	TemplateVersion *string
	EditableFields  []byte
}

func insertDuplicatedEmail(r *http.Request, dbpool *pgxpool.Pool, email duplicateEmailInsert) (EmailDetail, error) {
	var created EmailDetail
	var editableFields []byte

	err := dbpool.QueryRow(r.Context(), `
		INSERT INTO emails (
			slug,
			sequence,
			title,
			subject,
			preheader,
			send_timing,
			stage,
			sort_order,
			language,
			variant,
			body_text,
			content_parts,
			original_html,
			review_html,
			template_html,
			template_hash,
			template_version,
			editable_fields
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17, $18::jsonb)
		RETURNING
			id,
			slug,
			sequence,
			title,
			subject,
			preheader,
			send_timing,
			stage,
			sort_order,
			language,
			variant,
			0 AS open_comment_count,
			original_html,
			review_html,
			template_html,
			template_hash,
			template_version,
			editable_fields;
	`, email.Slug, email.Sequence, email.Title, email.Subject, email.Preheader, email.SendTiming, email.Stage, email.SortOrder, email.Language, email.Variant, email.BodyText, email.ContentParts, email.OriginalHTML, email.ReviewHTML, email.TemplateHTML, email.TemplateHash, email.TemplateVersion, email.EditableFields).Scan(
		&created.ID,
		&created.Slug,
		&created.Sequence,
		&created.Title,
		&created.Subject,
		&created.Preheader,
		&created.SendTiming,
		&created.Stage,
		&created.SortOrder,
		&created.Language,
		&created.Variant,
		&created.OpenCommentCount,
		&created.OriginalHTML,
		&created.ReviewHTML,
		&created.TemplateHTML,
		&created.TemplateHash,
		&created.TemplateVersion,
		&editableFields,
	)
	if err != nil {
		return EmailDetail{}, err
	}

	created.EditableFields = json.RawMessage(editableFields)
	return created, nil
}

func duplicateEmailSlug(sourceSlug string, sourceLanguage string, targetLanguage string, targetVariant string) string {
	base := strings.TrimSuffix(sourceSlug, "-old")
	sourceLanguage = strings.ToLower(strings.TrimSpace(sourceLanguage))
	if sourceLanguage != "" {
		base = strings.TrimSuffix(base, "-"+sourceLanguage)
	}

	slug := base + "-" + targetLanguage
	if targetVariant == "old" {
		slug += "-old"
	}

	return slug
}

func isEmailSlugConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) &&
		pgErr.Code == "23505" &&
		pgErr.ConstraintName == "emails_slug_unique"
}

func stringFromPointer(value *string) string {
	if value == nil {
		return ""
	}

	return *value
}
