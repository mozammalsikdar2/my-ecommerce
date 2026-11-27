"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Save,
  Underline,
} from "lucide-react";
import { sanitizePageHtmlInBrowser } from "@/lib/page-html-client";

interface PageEntry {
  id: string;
  slug: string;
  title: string;
  content: string;
  isPublished: boolean;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPageEntry(value: unknown): value is PageEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    typeof value.content === "string" &&
    typeof value.isPublished === "boolean" &&
    typeof value.updatedAt === "string"
  );
}

async function responseError(response: Response) {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === "string") return body.error;
  } catch {
    // The response may not contain JSON.
  }
  return `Request failed (${response.status})`;
}

export default function AdminPagesEditor() {
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [htmlMode, setHtmlMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    async function loadPages() {
      try {
        const response = await fetch("/api/pages", { cache: "no-store" });
        if (!response.ok) throw new Error(await responseError(response));
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isPageEntry)) {
          throw new Error("Pages API returned invalid data");
        }
        if (!active) return;

        setPages(data);
        const selected = data[0];
        if (selected) {
          setSelectedSlug(selected.slug);
          setTitle(selected.title);
          setContent(sanitizePageHtmlInBrowser(selected.content));
          setIsPublished(selected.isPublished);
        }
        setError(null);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load pages",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadPages();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!htmlMode && editorRef.current) {
      editorRef.current.innerHTML = sanitizePageHtmlInBrowser(content);
    }
  }, [content, htmlMode, selectedSlug]);

  function choosePage(slug: string) {
    const page = pages.find((item) => item.slug === slug);
    if (!page) return;
    setSelectedSlug(page.slug);
    setTitle(page.title);
    setContent(sanitizePageHtmlInBrowser(page.content));
    setIsPublished(page.isPublished);
    setHtmlMode(false);
    setError(null);
    setNotice(null);
  }

  function updateRichContent() {
    const editor = editorRef.current;
    if (!editor) return;
    const sanitized = sanitizePageHtmlInBrowser(editor.innerHTML);
    if (sanitized !== editor.innerHTML) editor.innerHTML = sanitized;
    setContent(sanitized);
  }

  function applyFormat(command: string, value?: string) {
    if (!editorRef.current || typeof document.execCommand !== "function") return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    updateRichContent();
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const clipboardHtml = event.clipboardData.getData("text/html");
    const clipboardText = event.clipboardData.getData("text/plain");
    if (clipboardHtml && typeof document.execCommand === "function") {
      document.execCommand(
        "insertHTML",
        false,
        sanitizePageHtmlInBrowser(clipboardHtml),
      );
    } else if (typeof document.execCommand === "function") {
      document.execCommand("insertText", false, clipboardText);
    }
    updateRichContent();
  }

  function switchEditorMode() {
    if (!htmlMode) updateRichContent();
    else setContent(sanitizePageHtmlInBrowser(content));
    setHtmlMode((mode) => !mode);
  }

  async function savePage() {
    const editorContent = htmlMode
      ? content
      : editorRef.current?.innerHTML ?? content;
    const safeContent = sanitizePageHtmlInBrowser(editorContent);
    if (!title.trim()) {
      setError("Page title is required");
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/pages/${encodeURIComponent(selectedSlug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: safeContent,
          isPublished,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const data: unknown = await response.json();
      if (!isPageEntry(data)) throw new Error("Pages API returned invalid data");

      const savedPage = {
        ...data,
        content: sanitizePageHtmlInBrowser(data.content),
      };
      setPages((current) =>
        current.map((page) => (page.id === savedPage.id ? savedPage : page)),
      );
      setTitle(savedPage.title);
      setContent(savedPage.content);
      setIsPublished(savedPage.isPublished);
      setNotice("Page saved successfully.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save page",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const selectedPage = pages.find((page) => page.slug === selectedSlug);

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-teal-700">Store content</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Page editor
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Edit policy and information pages shown on your storefront.
          </p>
        </div>
        {selectedPage && (
          <Link
            href={`/pages/${encodeURIComponent(selectedPage.slug)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Eye className="h-4 w-4" />
            {isPublished ? "View live page" : "Preview draft"}
          </Link>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">
          Loading pages...
        </div>
      ) : pages.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-600">
          No pages are available to edit.
        </div>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="h-fit rounded-xl border bg-white p-4">
            <label
              htmlFor="page-selector"
              className="text-sm font-semibold text-slate-800"
            >
              Store pages
            </label>
            <select
              id="page-selector"
              value={selectedSlug}
              onChange={(event) => choosePage(event.target.value)}
              className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
            >
              {pages.map((page) => (
                <option key={page.id} value={page.slug}>
                  {page.title}
                  {page.isPublished ? "" : " (Draft)"}
                </option>
              ))}
            </select>
            <p className="mt-3 break-all text-xs text-slate-500">
              URL: /pages/{selectedSlug}
            </p>
            {selectedPage && (
              <p className="mt-2 text-xs text-slate-500">
                Last updated:{" "}
                {new Date(selectedPage.updatedAt).toLocaleString()}
              </p>
            )}
          </aside>

          <div className="min-w-0 space-y-4 rounded-xl border bg-white p-4 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <label
                  htmlFor="page-title"
                  className="text-sm font-semibold text-slate-800"
                >
                  Page title
                </label>
                <input
                  id="page-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <label className="inline-flex items-center gap-2 pb-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(event) => setIsPublished(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
                Published
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
              <div className="flex flex-wrap items-center gap-1">
                <ToolbarButton label="Bold" onClick={() => applyFormat("bold")}>
                  <Bold className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Italic" onClick={() => applyFormat("italic")}>
                  <Italic className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  label="Underline"
                  onClick={() => applyFormat("underline")}
                >
                  <Underline className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  label="Heading"
                  onClick={() => applyFormat("formatBlock", "h2")}
                >
                  <Heading2 className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  label="Bulleted list"
                  onClick={() => applyFormat("insertUnorderedList")}
                >
                  <List className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  label="Numbered list"
                  onClick={() => applyFormat("insertOrderedList")}
                >
                  <ListOrdered className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  label="Insert link"
                  onClick={() => {
                    const url = window.prompt("Enter a link URL");
                    if (url) applyFormat("createLink", url);
                  }}
                >
                  <Link2 className="h-4 w-4" />
                </ToolbarButton>
              </div>
              <button
                type="button"
                onClick={switchEditorMode}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {htmlMode ? "Visual editor" : "HTML source"}
              </button>
            </div>

            {htmlMode ? (
              <textarea
                aria-label="Page HTML source"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                spellCheck={false}
                className="min-h-[360px] w-full resize-y rounded-lg border bg-slate-950 p-4 font-mono text-sm text-slate-100"
              />
            ) : (
              <div
                ref={editorRef}
                role="textbox"
                aria-label="Page content"
                aria-multiline="true"
                contentEditable
                suppressContentEditableWarning
                onInput={updateRichContent}
                onPaste={handlePaste}
                className="prose prose-slate min-h-[360px] max-w-none rounded-lg border p-4 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-slate-500">
                Only safe text formatting and links are retained when saved.
              </p>
              <button
                type="button"
                onClick={() => void savePage()}
                disabled={isSaving || !selectedSlug}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save page"}
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="rounded-md border p-2 text-slate-700 hover:bg-slate-100"
    >
      {children}
    </button>
  );
}
