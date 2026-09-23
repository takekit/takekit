import { Fragment, type ReactNode } from "react";

/**
 * Tiny, safe renderer for executor output: fenced code blocks, paragraphs,
 * `inline code` and **bold**. Everything else stays plain text (no HTML).
 */
export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const fence = /```[^\n]*\n([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(text))) {
    pushParagraphs(blocks, text.slice(last, match.index));
    blocks.push(
      <pre key={`code-${match.index}`} className="rt-code">
        <code>{match[1].replace(/\n$/, "")}</code>
      </pre>,
    );
    last = fence.lastIndex;
  }
  pushParagraphs(blocks, text.slice(last));
  return <div className="rt">{blocks}</div>;
}

function pushParagraphs(out: ReactNode[], chunk: string) {
  for (const para of chunk.split(/\n{2,}/)) {
    const trimmed = para.replace(/^\n+|\s+$/g, "");
    if (!trimmed) continue;
    out.push(
      <p key={`p-${out.length}`} className="rt-p">
        {inline(trimmed)}
      </p>,
    );
  }
}

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="rt-inline">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
