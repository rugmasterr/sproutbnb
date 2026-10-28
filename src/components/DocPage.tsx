'use client';

import { pages, type Block, type PageKey } from '@sprout/pages';
import { useI18n } from '@/i18n/I18nProvider';
import { Inline } from './Markup';
import { PageHead } from './ui';

const ZH_TITLE: Record<PageKey, string> = {
  docs: '文档',
  about: '春笋',
  guide: '入门',
  roadmap: '路线图',
  risk: '风险',
  terms: '条款',
};

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <div key={i}>
          {b.h && (
            <h3>
              <Inline text={b.h} />
            </h3>
          )}
          {b.p?.map((p, j) => (
            <p key={j}>
              <Inline text={p} />
            </p>
          ))}
          {b.ul && (
            <ul>
              {b.ul.map((li, j) => (
                <li key={j}>
                  <Inline text={li} />
                </li>
              ))}
            </ul>
          )}
          {b.table && (
            <div className="-mx-1 overflow-x-auto px-1">
              <table>
                <thead>
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
                        <td key={k}>
                          <Inline text={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {b.note && (
            <div className="my-4 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-fg">
              <Inline text={b.note} />
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export function DocPage({ page, toc = false, before }: { page: PageKey; toc?: boolean; before?: React.ReactNode }) {
  const { lang, t } = useI18n();
  const doc = pages[page]?.[lang] ?? pages[page]?.en;
  if (!doc) return null;
  const sections = doc.sections ?? [];
  const showToc = toc && sections.length > 1;
  return (
    <>
      <PageHead title={doc.title} zh={lang === 'en' ? ZH_TITLE[page] : undefined} sub={doc.lead} />
      <div className={`container py-10 ${showToc ? 'lg:grid lg:grid-cols-[220px_1fr] lg:gap-12' : ''}`}>
        {showToc && (
          <aside className="mb-8 lg:mb-0">
            <nav className="lg:sticky lg:top-24" aria-label={t('docs.toc')}>
              <div className="label">{t('docs.toc')}</div>
              <ul className="no-scrollbar flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:overflow-visible">
                {sections.map((s) => (
                  <li key={s.id} className="shrink-0">
                    <a href={`#${s.id}`} className="block whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-raised hover:text-fg lg:whitespace-normal">
                      {s.heading}
                    </a>
                  </li>
                ))}
                {doc.faq && doc.faq.length > 0 && (
                  <li className="shrink-0">
                    <a href="#faq" className="block whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-raised hover:text-fg">
                      {t('docs.faq')}
                    </a>
                  </li>
                )}
              </ul>
            </nav>
          </aside>
        )}
        <article className="prose-sprout mx-auto min-w-0 max-w-3xl lg:mx-0">
          {before}
          {sections.length === 0 && !doc.faq?.length && <p>{t('docs.missing')}</p>}
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 border-b border-line/40 pb-6 pt-4 last:border-0">
              <h2 className="text-2xl font-semibold text-fg">{s.heading}</h2>
              <Blocks blocks={s.blocks} />
            </section>
          ))}
          {doc.faq && doc.faq.length > 0 && (
            <section id="faq" className="scroll-mt-24 pt-6">
              <h2 className="text-2xl font-semibold text-fg">{t('docs.faq')}</h2>
              <div className="mt-4 space-y-2">
                {doc.faq.map((f, i) => (
                  <details key={i} className="card group px-4 py-3">
                    <summary className="cursor-pointer list-none font-medium text-fg">
                      <span className="mr-2 text-accent transition group-open:rotate-90">›</span>
                      <Inline text={f.q} />
                    </summary>
                    <p className="!mb-1">
                      <Inline text={f.a} />
                    </p>
                  </details>
                ))}
              </div>
            </section>
          )}
        </article>
      </div>
    </>
  );
}
