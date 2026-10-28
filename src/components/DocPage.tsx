'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { pages, type Block, type PageKey } from '@sprout/pages';
import { useI18n } from '@/i18n/I18nProvider';
import { NodeRing, StatusDot } from './fx';
import { Inline } from './Markup';
import { PageHead } from './ui';

type L = { en: string; zh: string };

const ZH_TITLE: Record<PageKey, string> = {
  docs: '文档',
  about: '春笋',
  guide: '入门',
  roadmap: '路线图',
  risk: '风险',
  terms: '条款',
};

const KICKER: Record<PageKey, L> = {
  docs: { en: 'Docs · Protocol', zh: '文档 · 协议' },
  about: { en: 'About · Sprout 春笋', zh: '关于 · 春笋' },
  guide: { en: 'Guide · Start here', zh: '指南 · 新手入门' },
  roadmap: { en: 'Roadmap · Seed → Grove', zh: '路线图 · 笋芽 → 竹林' },
  risk: { en: 'Risk · Read first', zh: '风险 · 请先阅读' },
  terms: { en: 'Terms · Legal', zh: '条款 · 法律' },
};

const UI = {
  sections: { en: 'Sections', zh: '章节' },
  read: { en: 'min read', zh: '分钟阅读' },
  note: { en: 'Note', zh: '提示' },
  keep: { en: 'Keep reading', zh: '继续阅读' },
  top: { en: 'Back to top', zh: '返回顶部' },
} satisfies Record<string, L>;

const ORDER: PageKey[] = ['guide', 'docs', 'about', 'roadmap', 'risk', 'terms'];
const HREF: Record<PageKey, string> = { docs: '/docs', about: '/about', guide: '/guide', roadmap: '/roadmap', risk: '/risk', terms: '/terms' };

const pad = (n: number) => String(n).padStart(2, '0');

function blockText(b: Block): string {
  return [b.h, ...(b.p ?? []), ...(b.ul ?? []), b.note, ...(b.table ? [...b.table.head, ...b.table.rows.flat()] : [])].filter(Boolean).join(' ');
}

/** Rough reading time: ~230 English words or ~420 Chinese characters per minute. */
function readMinutes(text: string, zh: boolean) {
  const units = zh ? (text.match(/[㐀-鿿]/g)?.length ?? 0) + text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length : text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(units / (zh ? 420 : 230)));
}

/** Highlights the section currently in view (for the table of contents). */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join('|');
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    // The active section is the last one whose top has passed ~30% of the viewport
    // (01 when above the first). Scroll-driven so a jump to the top also resets it.
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = window.innerHeight * 0.3;
      let cur = els[0].id;
      for (const el of els) {
        if (el.getBoundingClientRect().top <= line) cur = el.id;
        else break;
      }
      setActive(cur);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}

function Blocks({ blocks, zh, tone }: { blocks: Block[]; zh: boolean; tone: 'yellow' | 'green' }) {
  const prose = zh ? 'text-[15.5px] leading-[1.95]' : 'text-[15.5px] leading-[1.8]';
  return (
    <>
      {blocks.map((b, i) => (
        <div key={i}>
          {b.h && (
            <h3 className="mt-9 flex items-start gap-3 text-[1.15rem] font-semibold leading-snug tracking-[-0.02em] text-fg">
              <NodeRing tone={tone} className="mt-[0.5em]" />
              <span className="min-w-0">
                <Inline text={b.h} />
              </span>
            </h3>
          )}
          {b.p?.map((p, j) => (
            <p key={j} className={`my-4 text-muted ${prose}`}>
              <Inline text={p} />
            </p>
          ))}
          {b.ul && (
            <ul className="my-5 space-y-3">
              {b.ul.map((li, j) => (
                <li key={j} className={`flex gap-3.5 text-muted ${prose}`}>
                  <span aria-hidden className={`mt-[0.8em] h-[3px] w-2.5 shrink-0 rounded-full ${tone === 'green' ? 'bg-bamboo shadow-[0_0_8px_rgb(var(--bamboo)/0.8)]' : 'bg-accent shadow-[0_0_8px_rgb(var(--accent)/0.8)]'}`} />
                  <span className="min-w-0">
                    <Inline text={li} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {b.table && (
            <div className="my-6 overflow-x-auto rounded-xl border border-line-2 bg-raised/60">
              <table className="table-tech min-w-[520px]">
                <thead className="bg-white/[0.02]">
                  <tr>
                    {b.table.head.map((h, j) => (
                      <th key={j}>
                        <Inline text={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.table.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k} className={`align-top text-[13.5px] leading-6 ${k === 0 ? 'font-medium text-fg' : 'text-muted'}`}>
                          <Inline text={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {b.note && <Note tone={tone} text={b.note} zh={zh} />}
        </div>
      ))}
    </>
  );
}

function Note({ text, tone, zh }: { text: string; tone: 'yellow' | 'green'; zh: boolean }) {
  const y = tone === 'yellow';
  return (
    <aside
      className={`glass relative my-7 overflow-hidden !rounded-xl py-4 pl-5 pr-4 text-[14.5px] text-fg ${zh ? 'leading-[1.9]' : 'leading-7'} ${
        y ? '!border-accent/25' : '!border-bamboo/25'
      }`}
    >
      <span aria-hidden className={`absolute inset-y-3 left-0 w-[2px] rounded-full ${y ? 'bg-accent shadow-[0_0_14px_rgb(var(--accent))]' : 'bg-bamboo shadow-[0_0_14px_rgb(var(--bamboo))]'}`} />
      <span aria-hidden className={`pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full ${y ? 'glow-yellow' : 'glow-green'}`} />
      <span className={`relative mb-1.5 flex items-center gap-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] ${y ? 'text-accent' : 'text-bamboo-hi'}`}>
        <StatusDot tone={y ? 'yellow' : 'green'} pulse={false} />
        <NoteLabel />
      </span>
      <span className="relative block">
        <Inline text={text} />
      </span>
    </aside>
  );
}

function NoteLabel() {
  const { lang } = useI18n();
  return <>{lang === 'zh' ? UI.note.zh : UI.note.en}</>;
}

export function DocPage({ page, toc = false, before }: { page: PageKey; toc?: boolean; before?: React.ReactNode }) {
  const { lang, t } = useI18n();
  const l = (x: L) => (lang === 'zh' ? x.zh : x.en);
  const zh = lang === 'zh';
  const doc = pages[page]?.[lang] ?? pages[page]?.en;
  const sections = useMemo(() => doc?.sections ?? [], [doc]);
  const faq = useMemo(() => doc?.faq ?? [], [doc]);
  const tocItems = useMemo(() => [...sections.map((s) => ({ id: s.id, label: s.heading })), ...(faq.length ? [{ id: 'faq', label: t('docs.faq') }] : [])], [sections, faq.length, t]);
  const active = useActiveSection(tocItems.map((x) => x.id));
  const minutes = useMemo(() => {
    if (!doc) return 1;
    const all = [doc.lead, ...sections.flatMap((s) => [s.heading, ...s.blocks.map(blockText)]), ...faq.flatMap((f) => [f.q, f.a])].join(' ');
    return readMinutes(all, zh);
  }, [doc, sections, faq, zh]);
  if (!doc) return null;
  const showToc = toc && tocItems.length > 2;
  const activeIdx = Math.max(0, tocItems.findIndex((x) => x.id === active));
  const tone: 'yellow' | 'green' = page === 'about' || page === 'roadmap' ? 'green' : 'yellow';
  const others = ORDER.filter((k) => k !== page);

  return (
    <div id="doc-top">
      <PageHead title={doc.title} zh={lang === 'en' ? ZH_TITLE[page] : undefined} sub={doc.lead} kicker={l(KICKER[page])}>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          {sections.length > 0 && (
            <span className="inline-flex items-center gap-2">
              <StatusDot tone="green" pulse={false} />
              {l(UI.sections)} <span className="text-fg num">{pad(sections.length)}</span>
            </span>
          )}
          {faq.length > 0 && (
            <span>
              {t('docs.faq')} <span className="text-fg num">{pad(faq.length)}</span>
            </span>
          )}
          <span>
            ~<span className="text-fg num">{minutes}</span> {l(UI.read)}
          </span>
          <span className="hidden sm:inline">EN · 中文</span>
        </div>
      </PageHead>

      <div className={`container py-10 sm:py-14 ${showToc ? 'lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-16' : ''}`}>
        {showToc && (
          <aside className="mb-10 min-w-0 lg:mb-0">
            <nav className="lg:sticky lg:top-24" aria-label={t('docs.toc')}>
              <div className="mono-label flex items-center justify-between">
                <span>{t('docs.toc')}</span>
                <span className="hidden num lg:inline">
                  <span className="text-accent">{pad(activeIdx + 1)}</span> / {pad(tocItems.length)}
                </span>
              </div>
              {/* phone / tablet: horizontal chip rail */}
              <ul className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
                {tocItems.map((s, i) => (
                  <li key={s.id} className="shrink-0">
                    <a
                      href={`#${s.id}`}
                      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] transition ${
                        active === s.id ? 'border-accent/60 bg-accent/10 text-fg' : 'border-line-2 bg-raised text-muted hover:text-fg'
                      }`}
                    >
                      <span className={`font-mono text-[10px] ${active === s.id ? 'text-accent' : 'text-faint'}`}>{pad(i + 1)}</span>
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
              {/* desktop: bamboo stalk with node markers */}
              <ol className="relative mt-5 hidden pl-6 lg:block">
                <span aria-hidden className="absolute bottom-2 left-[4px] top-2 w-px bg-line-2">
                  <span
                    className="absolute inset-x-0 top-0 bg-gradient-to-b from-accent to-bamboo shadow-[0_0_10px_rgb(var(--accent)/0.7)] transition-[height] duration-500 ease-out"
                    style={{ height: `${((activeIdx + 1) / tocItems.length) * 100}%` }}
                  />
                </span>
                {tocItems.map((s, i) => {
                  const on = active === s.id;
                  const past = i < activeIdx;
                  return (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        aria-current={on ? 'location' : undefined}
                        className={`group relative flex gap-3 rounded-md py-[7px] text-[13.5px] leading-snug transition ${on ? 'text-fg' : 'text-faint hover:text-muted'}`}
                      >
                        <span
                          aria-hidden
                          className={`absolute -left-6 top-[13px] h-[5px] w-[9px] rounded-full border transition ${
                            on ? 'border-accent bg-accent shadow-[0_0_10px_rgb(var(--accent))]' : past ? 'border-bamboo bg-bamboo/70' : 'border-line-2 bg-bg'
                          }`}
                        />
                        <span className={`w-5 shrink-0 pt-px font-mono text-[10.5px] num ${on ? 'text-accent' : ''}`}>{pad(i + 1)}</span>
                        <span className="min-w-0">{s.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
              <a href="#doc-top" className="mt-6 hidden items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint transition hover:text-accent lg:inline-flex">
                <span aria-hidden>↑</span> {l(UI.top)}
              </a>
            </nav>
          </aside>
        )}

        <article className={`min-w-0 max-w-[68ch] ${showToc ? '' : 'mx-auto'}`}>
          {before}
          {sections.length === 0 && !faq.length && <p className="text-muted">{t('docs.missing')}</p>}
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-28 border-t border-line pb-6 pt-10 first:border-0 first:pt-0">
              <div className="flex items-center gap-3">
                <span className="kicker num">
                  <span className="opacity-60">§</span>
                  {pad(i + 1)}
                </span>
                <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-line-2 to-transparent" />
              </div>
              <h2 className="h2 mt-3 !text-[clamp(1.65rem,3.2vw,2.35rem)]">{s.heading}</h2>
              <Blocks blocks={s.blocks} zh={zh} tone={tone} />
            </section>
          ))}
          {faq.length > 0 && (
            <section id="faq" className="scroll-mt-28 border-t border-line pt-10">
              <span className="kicker">
                <span className="opacity-60">§</span>
                FAQ
              </span>
              <h2 className="h2 mt-3 !text-[clamp(1.65rem,3.2vw,2.35rem)]">{t('docs.faq')}</h2>
              <div className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line-2 bg-raised/60">
                {faq.map((f, i) => (
                  <details key={i} className="group transition-colors open:bg-white/[0.025]">
                    <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 transition hover:bg-white/[0.02] sm:gap-4 sm:px-5 [&::-webkit-details-marker]:hidden">
                      <span className="w-9 shrink-0 pt-[3px] font-mono text-[10.5px] font-medium text-faint transition group-open:text-accent num">Q.{pad(i + 1)}</span>
                      <span className="min-w-0 flex-1 font-medium leading-6 text-fg">
                        <Inline text={f.q} />
                      </span>
                      <span aria-hidden className="relative mt-1 h-4 w-4 shrink-0 text-muted transition group-open:text-accent">
                        <span className="absolute left-0 top-1/2 h-[1.5px] w-4 -translate-y-1/2 rounded bg-current" />
                        <span className="absolute left-1/2 top-0 h-4 w-[1.5px] -translate-x-1/2 rounded bg-current transition-transform duration-300 group-open:rotate-90 group-open:scale-y-0" />
                      </span>
                    </summary>
                    <div className={`px-4 pb-5 text-[15px] text-muted sm:pl-[4.75rem] sm:pr-12 ${zh ? 'leading-[1.9]' : 'leading-7'}`}>
                      <Inline text={f.a} />
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}

          <nav aria-label={l(UI.keep)} className="mt-16 border-t border-line pt-10">
            <span className="kicker-muted">{l(UI.keep)}</span>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {others.map((k, i) => {
                const d = pages[k]?.[lang] ?? pages[k]?.en;
                if (!d) return null;
                return (
                  <li key={k} className="min-w-0">
                    <Link href={HREF[k]} className="card card-hover group flex h-full items-start gap-4 p-4">
                      <span className="pt-0.5 font-mono text-[10.5px] text-faint transition group-hover:text-accent num">{pad(i + 1)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold tracking-[-0.01em] text-fg">{d.title}</span>
                        <span className="mt-1 line-clamp-2 block text-[13px] leading-5 text-muted">{d.lead}</span>
                      </span>
                      <span aria-hidden className="pt-0.5 font-mono text-faint transition group-hover:translate-x-0.5 group-hover:text-accent">
                        →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </article>
      </div>
    </div>
  );
}
