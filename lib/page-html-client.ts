const allowedTags = new Set([
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
]);

const discardContentTags = new Set([
  "embed",
  "iframe",
  "math",
  "noembed",
  "noframes",
  "noscript",
  "object",
  "script",
  "style",
  "svg",
  "template",
  "textarea",
  "xmp",
]);

function isSafeLink(value: string) {
  const href = value.trim();
  if (!href || href.startsWith("//") || href.includes("\\")) return false;
  if (
    href.startsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("./") ||
    href.startsWith("../")
  ) {
    return true;
  }

  try {
    const protocol = new URL(href, window.location.origin).protocol;
    return ["http:", "https:", "mailto:", "tel:"].includes(protocol);
  } catch {
    return false;
  }
}

function sanitizeChildren(parent: ParentNode) {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.remove();
      continue;
    }
    if (!(node instanceof Element)) continue;

    const tag = node.tagName.toLowerCase();
    if (discardContentTags.has(tag)) {
      node.remove();
      continue;
    }

    sanitizeChildren(node);
    if (!allowedTags.has(tag)) {
      node.replaceWith(...Array.from(node.childNodes));
      continue;
    }

    for (const attribute of Array.from(node.attributes)) {
      if (tag === "a" && (attribute.name === "href" || attribute.name === "title")) {
        if (attribute.name !== "href" || isSafeLink(attribute.value)) continue;
      }
      node.removeAttribute(attribute.name);
    }
  }
}

export function sanitizePageHtmlInBrowser(value: string) {
  const template = document.createElement("template");
  template.innerHTML = value;
  sanitizeChildren(template.content);
  return template.innerHTML;
}
