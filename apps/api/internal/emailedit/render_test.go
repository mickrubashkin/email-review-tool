package emailedit

import (
	"strings"
	"testing"
)

func TestRenderEditableHTML(t *testing.T) {
	templateHTML := `
		<div>
			<!--[if mso]>
				<v:roundrect href="{{ primary_cta_url }}" style="height:43px;width:{{ primary_cta_width_px }}px;">
					<center>{{ primary_cta_text }}</center>
				</v:roundrect>
			<![endif]-->
			<a href="https://example.com/old" style="display:block; width: 196px;" data-edit-text="primary_cta_text" data-edit-attr-href="primary_cta_url" data-edit-style-width-px="primary_cta_width_px">Old CTA</a>
		</div>
	`
	fields := EditableFields{
		"primary_cta_text": {
			Type:  FieldTypeText,
			Value: "Start now",
		},
		"primary_cta_url": {
			Type:  FieldTypeURL,
			Value: "https://example.com/start",
		},
		"primary_cta_width_px": {
			Type:  FieldTypeNumber,
			Value: 220,
		},
	}

	rendered, err := RenderEditableHTML(templateHTML, fields)
	if err != nil {
		t.Fatalf("RenderEditableHTML returned error: %v", err)
	}

	assertContains(t, rendered, `href="https://example.com/start"`)
	assertContains(t, rendered, `width: 220px`)
	assertContains(t, rendered, `Start now`)
	if strings.Contains(rendered, "{{ primary_cta") {
		t.Fatalf("rendered HTML still contains CTA markers:\n%s", rendered)
	}
}

func TestRenderEditableHTMLRejectsUnsafeURLScheme(t *testing.T) {
	templateHTML := `<a href="https://example.com" data-edit-attr-href="cta_url">CTA</a>`
	fields := EditableFields{
		"cta_url": {
			Type:  FieldTypeURL,
			Value: "javascript:alert(1)",
		},
	}

	_, err := RenderEditableHTML(templateHTML, fields)
	if err == nil {
		t.Fatal("RenderEditableHTML expected error for unsafe URL scheme")
	}
}

func TestRenderEditableHTMLWithMetadataUpdatesPreheaderTarget(t *testing.T) {
	templateHTML := `
		<div>
			<span data-email-preheader>Old preheader</span>
			&nbsp;&zwnj;&nbsp;
		</div>
	`

	rendered, err := RenderEditableHTMLWithMetadata(templateHTML, EditableFields{}, RenderMetadata{
		Preheader: "New preheader",
	})
	if err != nil {
		t.Fatalf("RenderEditableHTMLWithMetadata returned error: %v", err)
	}

	assertContains(t, rendered, `data-email-preheader="">New preheader</span>`)
	if strings.Contains(rendered, "Old preheader") {
		t.Fatalf("rendered HTML still contains old preheader:\n%s", rendered)
	}
}

func assertContains(t *testing.T, value string, substring string) {
	t.Helper()

	if !strings.Contains(value, substring) {
		t.Fatalf("expected rendered HTML to contain %q:\n%s", substring, value)
	}
}
