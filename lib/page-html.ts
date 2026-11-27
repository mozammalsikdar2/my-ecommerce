import sanitizeHtml from "sanitize-html";

const pageHtmlOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    "a",
    "b",
    "blockquote",
    "br",
    "code",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "hr",
    "i",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "u",
    "ul",
  ],
  allowedAttributes: {
    a: ["href", "title"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowProtocolRelative: false,
};

export function sanitizePageHtml(value: string) {
  return sanitizeHtml(value, pageHtmlOptions);
}
