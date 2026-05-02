package emailtext

import (
	"regexp"
	"strings"
)

type ContentParts struct {
	Subject    string   `json:"subject"`
	Preheader  string   `json:"preheader"`
	BannerText string   `json:"banner_text"`
	BodyText   string   `json:"body_text"`
	PrimaryCTA string   `json:"primary_cta"`
	Links      []string `json:"links"`
}

var (
	htmlCommentPattern = regexp.MustCompile(`(?is)<!--.*?-->`)
	headPattern        = regexp.MustCompile(`(?is)<head\b[^>]*>.*?</head>`)
	stylePattern       = regexp.MustCompile(`(?is)<style\b[^>]*>.*?</style>`)
	scriptPattern      = regexp.MustCompile(`(?is)<script\b[^>]*>.*?</script>`)
	xmlPattern         = regexp.MustCompile(`(?is)<xml\b[^>]*>.*?</xml>`)
	imgPattern         = regexp.MustCompile(`(?is)<img\b[^>]*>`)
	h1Pattern          = regexp.MustCompile(`(?is)<h1\b[^>]*>(.*?)</h1>`)
	linkPattern        = regexp.MustCompile(`(?is)<a\b[^>]*>(.*?)</a\s*>`)
	htmlTagPattern     = regexp.MustCompile(`(?is)<[^>]*>`)
	whitespacePattern  = regexp.MustCompile(`\s+`)
	namedEntities      = strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&#39;", "'",
		"&apos;", "'",
		"&nbsp;", " ",
		"&zwnj;", " ",
		"&ndash;", "-",
		"&mdash;", "-",
	)
)

func HTMLToText(value string) string {
	value = htmlCommentPattern.ReplaceAllString(value, " ")
	value = headPattern.ReplaceAllString(value, " ")
	value = stylePattern.ReplaceAllString(value, " ")
	value = scriptPattern.ReplaceAllString(value, " ")
	value = xmlPattern.ReplaceAllString(value, " ")
	value = htmlTagPattern.ReplaceAllString(value, " ")
	value = namedEntities.Replace(value)
	value = strings.ReplaceAll(value, "\u200c", " ")
	value = whitespacePattern.ReplaceAllString(value, " ")

	return strings.TrimSpace(value)
}

func ExtractContentParts(originalHTML string, subject string, preheader string, bodyText string) ContentParts {
	return ContentParts{
		Subject:    subject,
		Preheader:  preheader,
		BannerText: extractBannerText(originalHTML),
		BodyText:   bodyText,
		PrimaryCTA: extractPrimaryCTA(originalHTML),
		Links:      extractLinks(originalHTML),
	}
}

func extractBannerText(value string) string {
	for _, image := range imgPattern.FindAllString(value, -1) {
		alt := extractAttribute(image, "alt")
		if isMeaningfulImageAlt(alt) {
			return alt
		}
	}

	matches := h1Pattern.FindStringSubmatch(value)
	if len(matches) >= 2 {
		return HTMLToText(matches[1])
	}

	return ""
}

func isMeaningfulImageAlt(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}

	lowerValue := strings.ToLower(value)
	return !strings.Contains(lowerValue, "logo") &&
		!strings.Contains(lowerValue, "telegram") &&
		!strings.Contains(lowerValue, "linkedin") &&
		!strings.Contains(lowerValue, "youtube") &&
		!strings.Contains(lowerValue, "facebook")
}

func extractPrimaryCTA(value string) string {
	for _, link := range linkPattern.FindAllStringSubmatch(value, -1) {
		if len(link) < 2 {
			continue
		}

		attrs := link[0]
		text := HTMLToText(link[1])
		if text == "" {
			continue
		}

		lowerAttrs := strings.ToLower(attrs)
		if strings.Contains(lowerAttrs, "button") ||
			strings.Contains(lowerAttrs, "background-color") ||
			strings.Contains(lowerAttrs, "border-radius") ||
			strings.Contains(lowerAttrs, "display: inline-block") {
			return text
		}
	}

	links := extractLinks(value)
	if len(links) > 0 {
		return links[0]
	}

	return ""
}

func extractLinks(value string) []string {
	seen := map[string]bool{}
	links := []string{}

	for _, link := range linkPattern.FindAllStringSubmatch(value, -1) {
		if len(link) < 2 {
			continue
		}

		text := HTMLToText(link[1])
		if text == "" || seen[text] {
			continue
		}

		seen[text] = true
		links = append(links, text)
	}

	return links
}

func extractAttribute(tag string, attribute string) string {
	pattern := regexp.MustCompile(`(?is)\b` + regexp.QuoteMeta(attribute) + `\s*=\s*("([^"]*)"|'([^']*)')`)
	matches := pattern.FindStringSubmatch(tag)
	if len(matches) >= 3 && matches[2] != "" {
		return HTMLToText(matches[2])
	}
	if len(matches) >= 4 {
		return HTMLToText(matches[3])
	}

	return ""
}
