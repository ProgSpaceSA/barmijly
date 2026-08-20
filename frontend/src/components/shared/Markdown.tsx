"use client";
import { Children, createContext, isValidElement, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy, ExternalLink } from "lucide-react";
import { MARKDOWN_LABELS } from "@/lib/constants";
import { CODE_LANGUAGES } from "@/lib/code-languages";
import { cn } from "@/lib/utils";

/**
 * Renders stored Markdown source.
 *
 * Raw HTML is deliberately not enabled (`rehype-raw` is absent): descriptions
 * are written by every role in the company, so the only thing that ever reaches
 * the DOM is what the Markdown grammar itself produces.
 */

const REMARK_PLUGINS = [
  remarkGfm,
  // One Enter is one line break here. Ticket descriptions are written by
  // people, not by documentation authors — nobody expects a blank line to be
  // the price of a new line.
  remarkBreaks,
];

const REHYPE_PLUGINS = [
  [
    rehypeHighlight,
    {
      languages: CODE_LANGUAGES,
      // Guessing is only worth it for a fence with no language on it, and only
      // among the few we actually see pasted into tickets.
      detect: true,
      subset: ["typescript", "sql", "json", "bash", "csharp", "python", "xml"],
    },
  ],
] as never;

/** True for anything that leaves the app — those open in a new tab. */
function isExternal(href: string): boolean {
  return /^(https?:)?\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:");
}

/**
 * Every block-level element decides its own direction. A description is usually
 * Arabic with an English log pasted into the middle of it, and a single `dir` on
 * the wrapper would drag that log's punctuation to the wrong end.
 */
function autoDir<T extends ElementType>(Tag: T) {
  // `node` is react-markdown's hast handle. Every override has to drop it or it
  // lands on the element as `node="[object Object]"`.
  const Auto = ({ children, node, ...rest }: ComponentPropsWithoutRef<T> & ExtraProps) => {
    const Element = Tag as ElementType;
    return (
      <Element dir="auto" {...rest}>
        {children}
      </Element>
    );
  };
  Auto.displayName = `AutoDir(${String(Tag)})`;
  return Auto;
}

const AutoP = autoDir("p");
const AutoH1 = autoDir("h1");
const AutoH2 = autoDir("h2");
const AutoH3 = autoDir("h3");
const AutoH4 = autoDir("h4");
const AutoH5 = autoDir("h5");
const AutoH6 = autoDir("h6");
const AutoQuote = autoDir("blockquote");
const AutoTh = autoDir("th");
const AutoTd = autoDir("td");

function isCheckboxNode(node: ReactNode): boolean {
  return isValidElement(node) && (node.props as { type?: string }).type === "checkbox";
}

/** GFM `- [ ]` rows: the box is the marker, the rest of the line is the label. */
function MarkdownLi({ children, className, node, ...rest }: ComponentPropsWithoutRef<"li"> & ExtraProps) {
  const parts = Children.toArray(children);
  const box = parts.find(isCheckboxNode);
  if (!box) {
    return (
      <li dir="auto" className={className} {...rest}>
        {children}
      </li>
    );
  }

  return (
    <li dir="auto" className={cn("brm-md-task-item", className)} {...rest}>
      {box}
      <div className="brm-md-task-body">{parts.filter((part) => part !== box)}</div>
    </li>
  );
}

/** Set inside `<pre>` so the shared `code` renderer knows it is not inline. */
const InsideFence = createContext(false);

function CodeFence({ children, language }: { children: ReactNode; language?: string }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(preRef.current?.textContent ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard denied — the code is still selectable by hand. */
    }
  }, []);

  return (
    <div className="brm-md-fence" dir="ltr">
      <div className="brm-md-fence-bar">
        <span className="brm-md-fence-lang">{language || MARKDOWN_LABELS.plainCode}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="brm-md-fence-copy"
          title={MARKDOWN_LABELS.copyCode}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? MARKDOWN_LABELS.copied : MARKDOWN_LABELS.copy}</span>
        </button>
      </div>
      <pre ref={preRef}>
        <InsideFence.Provider value>{children}</InsideFence.Provider>
      </pre>
    </div>
  );
}

/** `language-ts` → `ts`, ignoring the `hljs` classes the highlighter adds. */
function languageOf(className: unknown): string | undefined {
  const list = Array.isArray(className) ? className.join(" ") : className;
  if (typeof list !== "string") return undefined;
  return /language-([\w-]+)/.exec(list)?.[1];
}

/** Inline `code`, or one line inside a fence — the context tells them apart. */
function MarkdownCode({ children, className, node, ...rest }: ComponentPropsWithoutRef<"code"> & ExtraProps) {
  const fenced = useContext(InsideFence);
  return (
    <code {...rest} className={fenced ? className : "brm-md-code"} dir={fenced ? undefined : "auto"}>
      {children}
    </code>
  );
}

export type MarkdownProps = {
  content?: string | null;
  className?: string;
  /** Prefix for root-relative images and links — uploads live on the API host. */
  baseUrl?: string;
  /** Opens the app's lightbox instead of navigating away. */
  onImageClick?: (src: string, alt: string) => void;
  /** Rendered when there is nothing to show. */
  empty?: ReactNode;
};

function MarkdownBody({ content, className, baseUrl, onImageClick, empty = null }: MarkdownProps) {
  const source = (content ?? "").trim();

  // Callers write `onImageClick={(src) => setLightbox(src)}` inline, so its
  // identity changes on every parent render. Reading it through a ref means the
  // component map below depends on whether there is a handler, not on which one.
  const imageClick = useRef(onImageClick);
  useEffect(() => {
    imageClick.current = onImageClick;
  }, [onImageClick]);
  const clickableImages = !!onImageClick;

  // Rebuilding this object would remount every node react-markdown produced —
  // which is how a code fence loses its "copied" tick mid-animation.
  const components = useMemo<Components>(() => {
    const resolve = (url: string) => (baseUrl && url.startsWith("/") ? `${baseUrl}${url}` : url);

    return {
      p: AutoP,
      li: MarkdownLi,
      h1: AutoH1,
      h2: AutoH2,
      h3: AutoH3,
      h4: AutoH4,
      h5: AutoH5,
      h6: AutoH6,
      blockquote: AutoQuote,
      th: AutoTh,
      td: AutoTd,
      code: MarkdownCode,

      a({ href, children, node, ...rest }) {
        const url = resolve(href ?? "");
        const external = isExternal(url);
        return (
          <a
            {...rest}
            href={url}
            dir="auto"
            className="brm-md-link"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {children}
            {external && <ExternalLink className="brm-md-link-icon" aria-hidden="true" />}
          </a>
        );
      },

      img({ src, alt, node, ...rest }) {
        const url = resolve(typeof src === "string" ? src : "");
        const label = alt ?? "";
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            {...rest}
            src={url}
            alt={label}
            loading="lazy"
            className="brm-md-img"
            data-clickable={clickableImages ? "true" : undefined}
            onClick={clickableImages ? () => imageClick.current?.(url, label) : undefined}
          />
        );
      },

      // The wrapper owns the header and the scroller; `<pre>` itself has to stay
      // a plain box or a long line would push the copy button off screen.
      pre({ children, node }) {
        const child = node?.children?.[0];
        const language =
          child && child.type === "element" ? languageOf(child.properties?.className) : undefined;
        return <CodeFence language={language}>{children}</CodeFence>;
      },

      table({ children, node, ...rest }) {
        return (
          <div className="brm-md-table-scroll">
            <table {...rest}>{children}</table>
          </div>
        );
      },

      // GFM task boxes stay read-only: the description is the source of truth
      // and is edited as text, never by clicking a box in the rendered view.
      input({ type, checked, node, ...rest }) {
        if (type !== "checkbox") return <input type={type} {...rest} />;
        return (
          <input
            type="checkbox"
            checked={!!checked}
            readOnly
            disabled
            tabIndex={-1}
            className="brm-md-task"
          />
        );
      },
    };
  }, [baseUrl, clickableImages]);

  if (!source) return <>{empty}</>;

  return (
    <div className={cn("brm-md", className)} dir="auto">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Parsing is the expensive half of this component and a ticket page re-renders
 * on every refetch, so memoising on the source keeps those renders free.
 */
export const Markdown = memo(MarkdownBody);
Markdown.displayName = "Markdown";
