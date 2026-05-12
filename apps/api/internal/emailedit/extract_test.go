package emailedit

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractEditableFields(t *testing.T) {
	templateHTML := `
		<div>
			<span data-email-preheader>Access your account.</span>
			<img src="https://example.com/banner.png" alt="Hero banner" data-edit-attr-src="hero_banner_src" data-edit-attr-alt="hero_banner_alt">
			<a href="https://example.com/private/" style="display:block; width: 196px;" data-edit-text="primary_cta_text" data-edit-attr-href="primary_cta_url" data-edit-style-width-px="primary_cta_width_px">Upload<br>documents</a>
		</div>
	`

	fields, err := ExtractEditableFields(templateHTML)
	if err != nil {
		t.Fatalf("ExtractEditableFields returned error: %v", err)
	}

	assertFieldMissing(t, fields, "preheader_text")
	assertFieldValue(t, fields, "hero_banner_src", FieldTypeImage, "https://example.com/banner.png")
	assertFieldValue(t, fields, "hero_banner_alt", FieldTypeText, "Hero banner")
	assertFieldValue(t, fields, "primary_cta_text", FieldTypeText, "Upload\ndocuments")
	assertFieldValue(t, fields, "primary_cta_url", FieldTypeURL, "https://example.com/private/")
	assertFieldValue(t, fields, "primary_cta_width_px", FieldTypeNumber, 196)
}

func TestExtractEditableFieldsRejectsConflictingDuplicateKeys(t *testing.T) {
	templateHTML := `
		<div>
			<span data-edit-text="headline">First</span>
			<span data-edit-text="headline">Second</span>
		</div>
	`

	_, err := ExtractEditableFields(templateHTML)
	if err == nil {
		t.Fatal("ExtractEditableFields expected error for conflicting duplicate keys")
	}
}

func TestApplicationReceivedSeedTemplateExtractsAndRenders(t *testing.T) {
	templateHTML := readRepoFile(t, "db/seeds/emails/01_registered/01_application-received/en.html")

	fields, err := ExtractEditableFields(templateHTML)
	if err != nil {
		t.Fatalf("ExtractEditableFields returned error: %v", err)
	}

	assertFieldValue(t, fields, "primary_cta_text", FieldTypeText, "Upload documents")
	assertFieldValue(t, fields, "primary_cta_url", FieldTypeURL, "https://partners.bitrix24.com/private/verify")
	assertFieldValue(t, fields, "primary_cta_width_px", FieldTypeNumber, 196)

	rendered, err := RenderEditableHTMLWithMetadata(templateHTML, fields, RenderMetadata{
		Preheader: "Access your account using the login details below.",
	})
	if err != nil {
		t.Fatalf("RenderEditableHTML returned error: %v", err)
	}

	assertContains(t, rendered, `href="https://partners.bitrix24.com/private/verify"`)
	assertContains(t, rendered, `width: 196px`)
	assertContains(t, rendered, `Upload documents`)
}

func assertFieldValue(t *testing.T, fields EditableFields, key string, fieldType string, value any) {
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

func assertFieldMissing(t *testing.T, fields EditableFields, key string) {
	t.Helper()

	if _, ok := fields[key]; ok {
		t.Fatalf("field %q should not be extracted", key)
	}
}

func readRepoFile(t *testing.T, path string) string {
	t.Helper()

	workingDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working dir: %v", err)
	}

	for dir := workingDir; ; dir = filepath.Dir(dir) {
		candidate := filepath.Join(dir, path)
		content, err := os.ReadFile(candidate)
		if err == nil {
			return string(content)
		}
		if !os.IsNotExist(err) {
			t.Fatalf("failed to read %s: %v", candidate, err)
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
	}

	t.Fatalf("failed to find repo file %s from %s", path, workingDir)
	return ""
}
