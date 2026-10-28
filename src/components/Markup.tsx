import Link from 'next/link';
import { Fragment } from 'react';

/** Only same-site paths, anchors, https and mailto links are rendered as links; anything else is plain text. */
function safeHref(h: string): { href: string; internal: boolean } | null {
  const x = h.trim();
  if (/^\/(?!\/)[\w\-./#?=&%]*$/.test(x)) return { href: x, internal: true };
  if (/^#[\w-]+$/.test(x)) return { href: x, internal: true };
  if (/^https:\/\/[^\s"'<>]+$/i.test(x)) return { href: x, internal: false };
  if (/^mailto:[^\s"'<>]+$/i.test(x)) return { href: x, internal: false };
  return null;
}

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

/**
 * Renders the content contract's inline markup (**bold**, `code`, [text](href)) as React nodes.
 * Never uses innerHTML, so content strings cannot inject markup or scripts.
 */
export function Inline({ text }: { text: string }) {
  const parts = text.split(TOKEN).filter((p) => p !== '');
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4)
          return (
            <strong key={i} className="font-semibold text-fg">
              {p.slice(2, -2)}
            </strong>
          );
        if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
          const v = p.slice(1, -1);
          // Hex / address-like values get the hashed-mono "chip" treatment and may break anywhere.
          const hexy = /^(0x[0-9a-fA-F]{4,}|[0-9a-fA-F]{8,}|[tuz]s?1[0-9a-zA-Z…]{4,}|…?\d{4})$/.test(v);
          return (
            <code
              key={i}
              className={`rounded-md border px-1.5 py-[1px] font-mono text-[0.84em] font-medium [overflow-wrap:anywhere] ${
                hexy ? 'border-accent/30 bg-accent/[0.07] text-accent-hi' : 'border-line-2 bg-ink-3 text-fg'
              }`}
            >
              {v}
            </code>
          );
        }
        const m = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        if (m) {
          const h = safeHref(m[2]);
          if (!h) return <Fragment key={i}>{m[1]}</Fragment>;
          const cls = 'text-accent-hi underline decoration-accent/35 underline-offset-[5px] transition hover:text-accent hover:decoration-accent';
          return h.internal ? (
            <Link key={i} href={h.href} className={cls}>
              {m[1]}
            </Link>
          ) : (
            <a key={i} href={h.href} target="_blank" rel="noopener noreferrer" className={cls}>
              {m[1]}
              <span aria-hidden className="ml-0.5 text-[0.8em]">
                ↗
              </span>
            </a>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
