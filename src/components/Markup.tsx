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
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>;
        const m = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        if (m) {
          const h = safeHref(m[2]);
          if (!h) return <Fragment key={i}>{m[1]}</Fragment>;
          return h.internal ? (
            <Link key={i} href={h.href}>
              {m[1]}
            </Link>
          ) : (
            <a key={i} href={h.href} target="_blank" rel="noopener noreferrer">
              {m[1]}
            </a>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
