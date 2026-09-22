import createDOMPurify from "dompurify";
import { z } from "zod";

export const MAX_DESK_BYTES = 64 * 1024 * 1024;
const text = z.string().max(200_000);

/** Images may load from the web or be embedded raster files, never executable documents. */
export function isImageSource(source: string): boolean {
  if (/^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z\d+/=\s]+$/i.test(source)) return true;
  try {
    const url = new URL(source);
    return ["https:", "http:", "blob:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export const outputSchema = z.object({
  logs: z.array(z.object({
    level: z.enum(["log", "info", "warn", "error"]),
    text,
  })).max(500),
  displays: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), text }),
    z.object({ kind: z.literal("json"), json: text }),
    z.object({ kind: z.literal("html"), html: text }),
    z.object({ kind: z.literal("image"), src: z.string().max(8_000_000).refine(isImageSource), alt: z.string().max(2000).optional() }),
    z.object({ kind: z.literal("error"), message: text, stack: text.optional() }),
    z.object({ kind: z.literal("table"), columns: z.array(z.string().max(2000)).max(100), rows: z.array(z.array(z.string().max(10_000)).max(100)).max(1000) }),
  ])).max(100),
});

// Keep the starter pages' typography and progress bars without allowing output
// to position itself over the editor, import CSS, or send CSS resource requests.
const styleProperties = new Set([
  "color", "background-color", "background", "font-size", "font-weight", "font-style",
  "text-align", "text-decoration", "line-height", "letter-spacing", "white-space",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border", "border-color", "border-width", "border-style", "border-radius",
  "width", "height", "max-width", "max-height", "min-width", "min-height",
  "display", "overflow", "gap", "flex-direction", "align-items", "justify-content",
]);

export function createOutputSanitizer(window: Window) {
  const purify = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);
  purify.addHook("afterSanitizeAttributes", (node) => {
    if (node.hasAttribute("style")) {
      const parsed = window.document.createElement("span").style;
      parsed.cssText = node.getAttribute("style") || "";
      const safe = window.document.createElement("span").style;
      for (const property of Array.from(parsed)) {
        const value = parsed.getPropertyValue(property);
        if (styleProperties.has(property) && !/url\s*\(|image|var\s*\(|attr\s*\(|expression|[\\@]/i.test(value)) {
          safe.setProperty(property, value);
        }
      }
      node.setAttribute("style", safe.cssText);
    }
    if (node.tagName === "IMG") {
      if (!isImageSource(node.getAttribute("src") || "")) node.removeAttribute("src");
      node.setAttribute("loading", "lazy");
      node.setAttribute("referrerpolicy", "no-referrer");
    }
    if (node.tagName === "A") node.setAttribute("rel", "noopener noreferrer");
  });
  return (html: string): string => purify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "select", "textarea", "video", "audio", "source"],
    FORBID_ATTR: ["id", "name", "srcset", "autofocus", "contenteditable", "tabindex"],
    ALLOW_DATA_ATTR: false,
  });
}

let sanitize: ReturnType<typeof createOutputSanitizer> | undefined;
export function sanitizeOutputHtml(html: string): string {
  // Persisted outputs hydrate after mount; never parse untrusted HTML on the server.
  if (typeof window === "undefined") return "";
  sanitize ??= createOutputSanitizer(window);
  return sanitize(html);
}
