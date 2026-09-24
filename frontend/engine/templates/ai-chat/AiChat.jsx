import {
  Children,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Sparkles,
  Send,
  Square,
  User,
  Copy,
  Check,
  RefreshCw,
  Eraser,
  AlertTriangle,
  Wrench,
  ServerCog,
  ExternalLink,
  ImageOff,
} from "lucide-react";

/**
 * AiChat — a self-contained AI chat component you can drop into ANY React
 * app (Next.js, Vite, CRA, ...), styled in a monochrome "Gemini" look.
 *
 * Requires Tailwind CSS and lucide-react in the host project:
 *   npm install lucide-react react-markdown remark-gfm
 *
 * It talks to the generated ai-server over SSE (/api/chat) which in turn
 * calls the generated mcp-server, which calls YOUR application API:
 *
 *   <AiChat />  ->  ai-server (Groq + tool calling)  ->  mcp-server  ->  your API
 *
 * User ID (checked in this order):
 *   1. `resolveUserId()` prop - return the host app's logged-in user id.
 *   2. `localStorage.profile` (result._id / result.id / result.userId) -
 *      the common shape used by MERN e-commerce apps.
 *   3. `userId` localStorage key (default; falls back to `userID`,
 *      `user_id`, `userid`) - useful for apps without authentication.
 *   4. If nothing exists yet, one is generated automatically and persisted.
 *   - The resolved id is sent with EVERY chat request and the ai-server
 *     injects it into tool payloads wherever a tool schema requires it.
 *   - Click the user chip in the header to change the id (persisted).
 *
 * Layout:
 *   - Fills the entire viewport (fixed inset-0). The message list scrolls;
 *     the header and input bar stay pinned to the top/bottom.
 *   - Messages, cards and tables use the full width of the screen (no
 *     centered column).
 *
 * Rendering (assistant answers are GitHub-flavored Markdown):
 *   - Paragraphs, lists, headings, code, links and tables are styled for chat.
 *   - Lists of records render as tables; image URLs in cells are shown as
 *     thumbnails. Bare image URLs in text are shown inline.
 *   - A ```card fenced block containing JSON ({ title, subtitle, image,
 *     description, fields, link }) renders as a card; a ```cards block with
 *     an array renders a card grid.
 *
 * Props:
 *   apiUrl       AI server base URL (default: the generated port)
 *   projectName  Title shown in the header
 *   subtitle     Small text under the title
 *   userIdKey    localStorage key for the user id (default 'userId')
 *   resolveUserId()  optional; return the host app's current user id
 *   onUserIdChange(userId)  optional callback when the id changes
 */

const DEFAULT_API_URL = "http://localhost:{{PORT_AI_SERVER}}";

const SUGGESTIONS = [
  "List the data available in the system",
  "What can you help me with?",
  "Show me the endpoints of this API",
];

const USER_ID_KEYS = ["userId", "userID", "user_id", "userid"];

// ============================================================
// SSE parsing (browser fetch ReadableStream)
// ============================================================

async function readSseStream(response, onEvent, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const abort = () => reader.cancel();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseEvent(rawEvent);
        if (parsed) onEvent(parsed);
      }
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

function parseEvent(raw) {
  let event = "message";
  const dataLines = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:"))
      dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

// ============================================================
// API helpers
// ============================================================

async function streamChat(apiUrl, messages, userId, signal) {
  const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, userId }),
    signal,
  });

  if (!response.ok) {
    let message = `AI server responded with HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body?.error?.message || message;
    } catch {
      /* keep default message */
    }
    throw new Error(message);
  }
  return response;
}

async function checkServerHealth(apiUrl) {
  try {
    const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/health`, {
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================
// User ID helpers (localStorage)
// ============================================================

function readStoredUserId(key) {
  try {
    for (const candidate of [key, ...USER_ID_KEYS]) {
      const value = localStorage.getItem(candidate);
      if (value && value.trim()) return value.trim();
    }
  } catch {
    /* storage unavailable */
  }
  return "";
}

/**
 * Reads the logged-in user id from the host app's `profile` entry, which is
 * the usual shape ({ result: { _id, ... } }) of MERN applications. Without
 * this, the chat would generate its own id and every cart/order it creates
 * would belong to a different (often non-existent) user.
 */
function readProfileUserId() {
  try {
    const raw = localStorage.getItem("profile");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    const result = parsed?.result ?? parsed?.user ?? parsed;
    const id = result?._id ?? result?.id ?? result?.userId;
    return id ? String(id).trim() : "";
  } catch {
    return "";
  }
}

function generateUserId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return (
    "u-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

function persistUserId(key, id) {
  try {
    localStorage.setItem(key, id);
  } catch {
    /* storage unavailable */
  }
}

// ============================================================
// Chat state machine
// ============================================================

function useChat(apiUrl, userId) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("idle");
  const [toolEvents, setToolEvents] = useState([]);
  const [serverUp, setServerUp] = useState(null);
  const [lastError, setLastError] = useState(null);
  const abortRef = useRef(null);
  const lastMessagesRef = useRef([]);

  useEffect(() => {
    checkServerHealth(apiUrl).then((up) => setServerUp(up));
  }, [apiUrl]);

  const send = useCallback(
    async (text) => {
      if (!text.trim() || status === "streaming") return;
      abortRef.current?.abort();

      const userMessage = {
        role: "user",
        content: text.trim(),
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      lastMessagesRef.current = [...lastMessagesRef.current, userMessage];
      const history = [...lastMessagesRef.current];
      setMessages(history);
      setStatus("thinking");
      setToolEvents([]);
      setLastError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await streamChat(
          apiUrl,
          history,
          userId,
          controller.signal,
        );
        const assistantText = [];

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "",
            streaming: true,
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ]);

        await readSseStream(
          response,
          ({ event, data }) => {
            let payload = {};
            try {
              payload = data ? JSON.parse(data) : {};
            } catch {
              /* ignore malformed frames */
            }

            switch (event) {
              case "status":
                if (payload.message)
                  setStatus((s) => (s === "error" ? s : "thinking"));
                break;
              case "tool_call":
                setToolEvents((prev) => [
                  ...prev,
                  { name: payload.name, status: "running", args: payload.args },
                ]);
                break;
              case "tool_result":
                setToolEvents((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last && last.name === payload.name) {
                    last.status = payload.success ? "ok" : "error";
                    last.summary = payload.summary;
                  }
                  return next;
                });
                break;
              case "delta":
                assistantText.push(payload.text || "");
                setStatus("streaming");
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last && last.role === "assistant" && last.streaming) {
                    last.content = assistantText.join("");
                  }
                  return next;
                });
                break;
              case "error":
                throw new Error(payload.message || "AI server stream error");
              case "done":
                break;
              default:
                break;
            }
          },
          controller.signal,
        );

        const finalContent = assistantText.join("") || "No response generated.";
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            last.content = finalContent;
            delete last.streaming;
          }
          return next;
        });
        lastMessagesRef.current = [
          ...history,
          { role: "assistant", content: finalContent },
        ];
        setStatus("idle");
      } catch (err) {
        if (err?.name === "AbortError") return;
        setStatus("error");
        setLastError(err.message);
      }
    },
    [apiUrl, status, userId],
  );

  const retry = useCallback(() => {
    if (status !== "error") return;
    const history = lastMessagesRef.current.slice();
    const lastUser = history.pop();
    if (!lastUser || lastUser.role !== "user") return;
    lastMessagesRef.current = history;
    setMessages(history);
    send(lastUser.content);
  }, [send, status]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setToolEvents([]);
    setStatus("idle");
    setLastError(null);
    lastMessagesRef.current = [];
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
  }, []);

  return {
    messages,
    status,
    toolEvents,
    serverUp,
    lastError,
    send,
    retry,
    clear,
    stop,
  };
}

// ============================================================
// Sub-components
// ============================================================

function ToolBadge({ tool }) {
  const isOk = tool.status === "ok";
  const isErr = tool.status === "error";
  const cls = isOk
    ? "bg-white text-black border-white"
    : isErr
      ? "bg-transparent text-white/70 border-white/30"
      : "bg-transparent text-white/60 border-white/20";
  const label =
    tool.status === "running"
      ? `${tool.name}…`
      : isOk
        ? `${tool.name} done`
        : `${tool.name} failed`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide transition-colors duration-300 ${cls}`}
      title={tool.summary || ""}
    >
      {tool.status === "running" ? (
        <RefreshCw size={11} className="animate-spin" />
      ) : isOk ? (
        <Check size={11} />
      ) : (
        <AlertTriangle size={11} />
      )}
      {label}
    </span>
  );
}

// ============================================================
// Rich rendering: tables, cards, images
// ============================================================

const URL_SPLIT_PATTERN = /(https?:\/\/[^\s<>"'`)]+)/g;
const IMAGE_EXTENSION_PATTERN =
  /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(\?[^\s]*)?$/i;
const CARD_LANGUAGES = new Set([
  "card",
  "cards",
  "aig-card",
  "aig-cards",
  "datacard",
]);
const CARD_META_KEYS = new Set([
  "title",
  "name",
  "heading",
  "subtitle",
  "subheading",
  "description",
  "body",
  "text",
  "image",
  "imageUrl",
  "thumbnail",
  "photo",
  "images",
  "link",
  "url",
  "linkLabel",
  "href",
]);

function isImageUrl(value) {
  const url = String(value || "").trim().replace(/[.,;:!?]+$/, "");
  return IMAGE_EXTENSION_PATTERN.test(url) || /^data:image\//i.test(url);
}

/** Image with a graceful fallback and click-to-open in a new tab. */
function SmartImage({ src, alt = "", variant = "inline", className = "" }) {
  const [failed, setFailed] = useState(false);
  const source = typeof src === "string" ? src.trim() : "";

  useEffect(() => setFailed(false), [source]);

  if (!source) return null;

  if (failed) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/40 ${className}`}
      >
        <ImageOff size={12} />
        {alt || "image unavailable"}
      </span>
    );
  }

  const base =
    variant === "cover"
      ? "block h-full w-full object-cover"
      : "my-1.5 inline-block max-h-72 max-w-full rounded-xl border border-white/10 bg-white/[0.03] object-contain align-middle";

  return (
    <img
      src={source}
      alt={alt || ""}
      title={source}
      loading="lazy"
      onClick={() => window.open(source, "_blank", "noopener,noreferrer")}
      onError={() => setFailed(true)}
      className={`${base} cursor-zoom-in transition-opacity duration-200 hover:opacity-90 ${className}`}
    />
  );
}

/** Turns bare URLs in text into links and image URLs into inline images. */
function renderTextWithMedia(children, keyPrefix = "media") {
  return Children.map(children, (child, childIndex) => {
    if (typeof child !== "string") return child;
    const parts = child.split(URL_SPLIT_PATTERN);
    if (parts.length === 1) return child;

    return parts.map((part, partIndex) => {
      if (partIndex % 2 === 1) {
        const url = part.replace(/[.,;:!?]+$/, "");
        if (isImageUrl(url)) {
          return (
            <SmartImage key={`${keyPrefix}-${childIndex}-${partIndex}`} src={url} />
          );
        }
        return (
          <a
            key={`${keyPrefix}-${childIndex}-${partIndex}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white underline underline-offset-2 hover:opacity-75"
          >
            {url}
          </a>
        );
      }
      return part;
    });
  });
}

function formatCardValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeCardFields(fields) {
  if (Array.isArray(fields)) {
    return fields
      .map((item) => {
        if (item && typeof item === "object") {
          const label = item.label ?? item.name ?? item.key ?? item.field ?? "";
          const value = item.value ?? item.text ?? item.data;
          if (!label && value === undefined) return null;
          return { label: String(label), value: formatCardValue(value) };
        }
        return { label: "", value: formatCardValue(item) };
      })
      .filter(Boolean);
  }
  if (fields && typeof fields === "object") {
    return Object.entries(fields).map(([label, value]) => ({
      label,
      value: formatCardValue(value),
    }));
  }
  return [];
}

/** Falls back to every primitive key of the object when `fields` is absent. */
function cardFields(card) {
  if (card.fields !== undefined) return normalizeCardFields(card.fields);
  return Object.entries(card)
    .filter(
      ([key, value]) =>
        !CARD_META_KEYS.has(key) && value !== null && typeof value !== "object"
    )
    .map(([label, value]) => ({ label, value: formatCardValue(value) }));
}

function DataCard({ card }) {
  if (!card || typeof card !== "object") return null;

  const title = card.title ?? card.name ?? card.heading ?? "";
  const subtitle = card.subtitle ?? card.subheading ?? "";
  const description = card.description ?? card.body ?? card.text ?? "";
  const image =
    [card.image, card.imageUrl, card.thumbnail, card.photo].find(
      (value) => typeof value === "string" && value.trim()
    ) ||
    (Array.isArray(card.images)
      ? card.images.find((value) => typeof value === "string" && value.trim())
      : "");
  const link =
    card.link && typeof card.link === "object"
      ? card.link
      : card.url
        ? { url: card.url, label: card.linkLabel }
        : null;
  const fields = cardFields(card);

  if (
    !title &&
    !subtitle &&
    !description &&
    !image &&
    !fields.length &&
    !link?.url
  ) {
    return null;
  }

  return (
    <article className="my-2 overflow-hidden rounded-2xl border border-white/20 bg-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-md">
      {image && (
        <div className="h-48 w-full overflow-hidden border-b border-white/10 bg-black/30">
          <SmartImage
            src={image}
            alt={String(title || "image")}
            variant="cover"
          />
        </div>
      )}
      <div className="p-5">
        {title && (
          <h4 className="text-[15px] font-bold tracking-tight">
            {String(title)}
          </h4>
        )}
        {subtitle && (
          <p className="mt-0.5 text-xs font-medium text-white/60">{String(subtitle)}</p>
        )}
        {description && (
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            {String(description)}
          </p>
        )}
        {fields.length > 0 && (
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {fields.map((field, index) => (
              <div
                key={`${field.label}-${index}`}
                className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-2 last:border-0"
              >
                <dt className="text-[11px] font-bold uppercase tracking-wide text-white/60">
                  {field.label}
                </dt>
                <dd className="min-w-0 break-words text-right text-[13px] font-bold">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {link?.url && (
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white underline underline-offset-2 hover:opacity-75"
          >
            {link.label || "Open"}
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </article>
  );
}

function parseCardSource(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    /* fall through to substring extraction */
  }
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Renders a ```card / ```cards fenced JSON block as one card or a grid. */
function CardBlock({ source }) {
  const parsed = parseCardSource(source);
  if (!parsed) return null;
  const cards = (Array.isArray(parsed) ? parsed : [parsed]).filter(
    (card) => card && typeof card === "object"
  );
  if (!cards.length) return null;

  if (cards.length === 1) return <DataCard card={cards[0]} />;

  return (
    <div className="my-2 grid gap-3 sm:grid-cols-2">
      {cards.map((card, index) => (
        <DataCard key={index} card={card} />
      ))}
    </div>
  );
}

function MarkdownContent({ content }) {
  const components = useMemo(
    () => ({
      p: ({ children }) => (
        <p className="my-2 leading-relaxed first:mt-0 last:mb-0">
          {renderTextWithMedia(children, "p")}
        </p>
      ),
      h1: ({ children }) => (
        <h1 className="mb-2 mt-3 text-lg font-bold first:mt-0">
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 className="mb-2 mt-3 text-base font-bold first:mt-0">
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="mb-2 mt-3 text-[15px] font-bold first:mt-0">
          {children}
        </h3>
      ),
      h4: ({ children }) => (
        <h4 className="mb-2 mt-3 text-sm font-bold first:mt-0">
          {children}
        </h4>
      ),
      ul: ({ children }) => (
        <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>
      ),
      li: ({ children }) => (
        <li className="leading-relaxed">
          {renderTextWithMedia(children, "li")}
        </li>
      ),
      strong: ({ children }) => (
        <strong className="font-bold text-white">{children}</strong>
      ),
      em: ({ children }) => <em className="italic">{children}</em>,
      a: ({ href, children }) => {
        // remark-gfm auto-links bare URLs, so an image URL arrives here as a
        // link - show the picture instead of a plain anchor.
        if (typeof href === "string" && isImageUrl(href)) {
          return (
            <SmartImage
              src={href}
              alt={typeof children === "string" ? children : ""}
            />
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white underline underline-offset-2 hover:opacity-75"
          >
            {children}
          </a>
        );
      },
      img: ({ src, alt }) => (
        <SmartImage src={typeof src === "string" ? src : ""} alt={alt || ""} />
      ),
      code: ({ inline, className, children }) => {
        const language = /language-([\w-]+)/
          .exec(className || "")?.[1]
          ?.toLowerCase();
        const raw = String(children ?? "");
        // react-markdown v9 dropped the `inline` prop - fall back to detecting
        // fenced blocks by their language class / trailing newline.
        const isInline = inline ?? (!language && !raw.includes("\n"));

        if (
          !isInline &&
          language &&
          CARD_LANGUAGES.has(language) &&
          parseCardSource(raw)
        ) {
          return <CardBlock source={raw} />;
        }

        if (isInline) {
          return (
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12.5px] text-white">
              {children}
            </code>
          );
        }
        return (
          <code
            className={`block overflow-x-auto rounded-lg border border-white/10 bg-black/50 px-3 py-2.5 font-mono text-[12.5px] leading-relaxed ${className || ""}`}
          >
            {children}
          </code>
        );
      },
      pre: ({ children }) => {
        const isCard = Children.toArray(children).some(
          (child) => child?.type === CardBlock
        );
        if (isCard) return <>{children}</>;
        return <pre className="my-2 last:mb-0">{children}</pre>;
      },
      table: ({ children }) => (
        <div className="my-3 w-full overflow-x-auto rounded-xl border border-white/20 bg-white/[0.03] shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
          <table className="w-full border-collapse text-[13px]">
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => (
        <thead className="bg-white/[0.12]">{children}</thead>
      ),
      tr: ({ children }) => (
        <tr className="even:bg-white/[0.05]">{children}</tr>
      ),
      th: ({ children }) => (
        <th className="whitespace-nowrap border-b border-white/15 px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-white/80">
          {renderTextWithMedia(children, "th")}
        </th>
      ),
      td: ({ children }) => (
        <td className="border-b border-white/10 px-4 py-2.5 align-top font-medium text-white/95 [&_img]:my-0 [&_img]:h-12 [&_img]:w-12 [&_img]:rounded-md [&_img]:border-0 [&_img]:object-cover">
          {renderTextWithMedia(children, "td")}
        </td>
      ),
      hr: () => <hr className="my-3 border-white/10" />,
      blockquote: ({ children }) => (
        <blockquote className="my-2 border-l-2 border-white/25 pl-3 text-white/70">
          {children}
        </blockquote>
      ),
    }),
    [],
  );

  return (
    <div className="min-w-0 text-[14px] leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function Message({ message, toolEvents, showTools }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div
      className={`group flex w-full gap-3 animate-[fadeIn_.4s_ease] ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {!isUser && (
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 backdrop-blur-md">
          <Sparkles size={15} className="text-white" />
        </div>
      )}

      <div
        className={`flex min-w-0 max-w-full flex-1 flex-col ${isUser ? "items-end" : "items-start"}`}
      >
        <div
          className={`break-words rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed shadow-[0_1px_0_rgba(255,255,255,0.03)] ${
            isUser
              ? "rounded-br-md bg-white text-black"
              : "rounded-bl-md border border-white/15 bg-white/[0.06] text-white backdrop-blur-md"
          }`}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">
              {message.content || "\u00A0"}
            </span>
          ) : (
            <>
              {message.content ? (
                <MarkdownContent content={message.content} />
              ) : (
                message.streaming && <span className="inline-block">{"\u00A0"}</span>
              )}
              {message.streaming && (
                <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-current align-middle" />
              )}
            </>
          )}
        </div>

        {showTools && toolEvents.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {toolEvents.map((tool, idx) => (
              <ToolBadge key={`${tool.name}-${idx}`} tool={tool} />
            ))}
          </div>
        )}

        <div className="mt-1 flex items-center gap-2 px-1">
          <span className="text-[10px] text-white/35">{message.time}</span>
          {!isUser && !message.streaming && message.content && (
            <button
              type="button"
              onClick={copy}
              title="Copy message"
              aria-label="Copy message"
              className="flex h-5 w-5 items-center justify-center text-white/30 opacity-0 transition-opacity duration-200 hover:text-white group-hover:opacity-100"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          )}
        </div>
      </div>

      {isUser && (
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 backdrop-blur-md">
          <User size={15} className="text-white" />
        </div>
      )}
    </div>
  );
}

function StatusPill({ serverUp }) {
  const label =
    serverUp === null ? "Connecting…" : serverUp ? "Connected" : "Unreachable";
  const dotCls =
    serverUp === null
      ? "bg-white/40 animate-pulse"
      : serverUp
        ? "bg-white"
        : "bg-white/30";

  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/60 backdrop-blur-md sm:inline-flex"
      title="AI server connection"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${dotCls}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

// ============================================================
// The component
// ============================================================

export default function AiChat({
  apiUrl = DEFAULT_API_URL,
  projectName = "{{PROJECT_NAME}}",
  subtitle = "Ask anything about your data",
  userIdKey = "userId",
  resolveUserId,
  onUserIdChange,
}) {
  const [userId, setUserId] = useState("");
  const [editingUserId, setEditingUserId] = useState(false);
  const [draftUserId, setDraftUserId] = useState("");
  const {
    messages,
    status,
    toolEvents,
    serverUp,
    lastError,
    send,
    retry,
    clear,
    stop,
  } = useChat(apiUrl, userId);

  const busy = status === "thinking" || status === "streaming";
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    // Prefer the host app's logged-in user, then the stored id, then generate.
    let id = "";
    if (typeof resolveUserId === "function") {
      try {
        id = String(resolveUserId() || "").trim();
      } catch {
        /* host resolver failed - fall through */
      }
    }
    if (!id) id = readProfileUserId();
    if (!id) id = readStoredUserId(userIdKey);
    if (!id) id = generateUserId();
    persistUserId(userIdKey, id);
    setUserId(id);
  }, [userIdKey, resolveUserId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, toolEvents, status]);

  const submitDraftUserId = () => {
    const id = draftUserId.trim();
    if (!id) return;
    setUserId(id);
    persistUserId(userIdKey, id);
    setEditingUserId(false);
    setDraftUserId("");
    onUserIdChange?.(id);
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const submit = () => {
    const value = textareaRef.current?.value.trim();
    if (!value) return;
    send(value);
    textareaRef.current.value = "";
    autoResize();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-black text-white">
      {/* ambient background blur blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 animate-[drift_18s_ease-in-out_infinite] rounded-full bg-white/[0.06] blur-[100px]" />
        <div className="absolute -bottom-40 -right-24 h-[28rem] w-[28rem] animate-[drift2_22s_ease-in-out_infinite] rounded-full bg-white/[0.05] blur-[120px]" />
        <div className="absolute left-1/3 top-1/2 h-72 w-72 -translate-y-1/2 animate-[drift_26s_ease-in-out_infinite_reverse] rounded-full bg-white/[0.035] blur-[110px]" />
      </div>

      {/* header */}
      <header className="relative z-10 flex flex-shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5">
            <Sparkles size={17} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium tracking-tight">
              {projectName}
            </h1>
            <p className="truncate text-xs text-white/45">{subtitle}</p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <StatusPill serverUp={serverUp} />

          {editingUserId ? (
            <input
              autoFocus
              value={draftUserId}
              onChange={(e) => setDraftUserId(e.target.value)}
              onBlur={submitDraftUserId}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitDraftUserId();
                if (e.key === "Escape") setEditingUserId(false);
              }}
              placeholder="New user id…"
              aria-label="User ID"
              className="hidden w-32 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] text-white outline-none backdrop-blur-md focus:border-white/40 sm:inline-block"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraftUserId(userId);
                setEditingUserId(true);
              }}
              title="Click to change the user id (stored in localStorage)"
              className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/60 backdrop-blur-md transition-colors duration-200 hover:border-white/30 hover:text-white sm:inline-flex"
            >
              <User size={11} />
              <b className="font-semibold text-white">
                {userId ? `${userId.slice(0, 8)}…` : "no user"}
              </b>
            </button>
          )}

          <button
            type="button"
            onClick={clear}
            disabled={messages.length === 0}
            title="Clear chat"
            aria-label="Clear chat"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 backdrop-blur-md transition-colors duration-200 hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Eraser size={14} />
          </button>
        </div>
      </header>

      {/* messages */}
      <div
        ref={scrollRef}
        className="relative z-10 flex-1 overflow-y-auto px-4 pb-40 pt-6 sm:px-6"
      >
        <div className="flex w-full flex-col gap-5">
          {messages.length === 0 ? (
            <div className="mx-auto mt-16 w-full max-w-3xl text-center animate-[fadeIn_.5s_ease]">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/5 backdrop-blur-md">
                <Sparkles size={26} className="text-white" />
              </div>
              <h2 className="text-lg font-bold tracking-tight">
                Ask about the {projectName} API
              </h2>
              <p className="mt-2 text-sm text-white/45">
                The assistant calls your API through the generated MCP server
                and streams the answer back.
              </p>

              <div className="mt-7 flex flex-col items-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    disabled={busy}
                    className="w-full rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-left text-[13px] font-medium text-white/70 backdrop-blur-md transition-all duration-200 hover:border-white/30 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, idx) => (
              <Message
                key={`${message.role}-${idx}`}
                message={message}
                toolEvents={toolEvents}
                showTools={idx === messages.length - 1 && busy}
              />
            ))
          )}

          {status === "thinking" && (
            <div className="flex items-center gap-3 animate-[fadeIn_.3s_ease]">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 backdrop-blur-md">
                <Sparkles size={15} className="text-white" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[13px] text-white/60 backdrop-blur-md">
                <Wrench size={13} className="animate-spin" />
                {toolEvents.length > 0 ? "Working on it…" : "Thinking…"}
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="flex w-full items-start gap-3 rounded-2xl border border-white/20 bg-white/[0.06] px-4 py-3 backdrop-blur-md animate-[fadeIn_.3s_ease]">
              <AlertTriangle
                size={16}
                className="mt-0.5 flex-shrink-0 text-white"
              />
              <div className="flex-1">
                <b className="block text-[13px] font-medium">
                  Something went wrong
                </b>
                <p className="mt-0.5 text-xs text-white/50">{lastError}</p>
              </div>
              <button
                type="button"
                onClick={retry}
                className="flex-shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black transition-opacity duration-200 hover:opacity-80"
              >
                Retry
              </button>
            </div>
          )}

          {serverUp === false && status === "idle" && messages.length === 0 && (
            <div className="flex w-full items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-white/50 backdrop-blur-md">
              <ServerCog size={13} />
              AI server not reachable at {apiUrl} — is it running?
            </div>
          )}
        </div>
      </div>

      {/* fixed, full-width input bar */}
      <footer className="absolute inset-x-0 bottom-0 z-20 border-t border-white/10 bg-black/70 px-4 pb-4 pt-3 backdrop-blur-xl sm:px-6">
        <div className="w-full">
          <div className="flex items-end gap-2 rounded-3xl border border-white/15 bg-white/[0.04] p-2 backdrop-blur-md transition-colors duration-200 focus-within:border-white/40">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Ask about your application data…"
              aria-label="Message"
              onKeyDown={handleKeyDown}
              onInput={autoResize}
              disabled={busy}
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-white placeholder-white/35 outline-none disabled:opacity-50"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                title="Stop generating"
                aria-label="Stop generating"
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform duration-150 hover:scale-95 active:scale-90"
              >
                <Square size={15} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                title="Send message"
                aria-label="Send message"
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform duration-150 hover:scale-95 active:scale-90 disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-white/30">
            Enter to send · Shift+Enter for a new line · AI can make mistakes —
            verify important data.
          </p>
        </div>
      </footer>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes drift { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,-20px) scale(1.08); } }
        @keyframes drift2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-25px,25px) scale(1.05); } }
      `}</style>
    </div>
  );
}
