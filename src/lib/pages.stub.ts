// Fallback used only when src/content/pages.ts (written by the content agent) is absent at build time.
// Same types as the docs content contract; every page renders an honest "being written" state.

export type Lang = 'en' | 'zh';
export type Block = { h?: string; p?: string[]; ul?: string[]; table?: { head: string[]; rows: string[][] }; note?: string };
export type PageDoc = {
  title: string;
  lead: string;
  sections: { id: string; heading: string; blocks: Block[] }[];
  faq?: { q: string; a: string }[];
};
export type PageKey = 'docs' | 'about' | 'guide' | 'roadmap' | 'risk' | 'terms';

const t: Record<PageKey, [string, string]> = {
  docs: ['Docs & FAQ', '文档与问答'],
  about: ['What is Sprout', '春笋是什么'],
  guide: ['Start here', '新手入门'],
  roadmap: ['Roadmap', '路线图'],
  risk: ['Risk', '风险提示'],
  terms: ['Terms', '使用条款'],
};

const doc = (title: string, lead: string): PageDoc => ({ title, lead, sections: [] });

export const pages: Record<PageKey, Record<Lang, PageDoc>> = Object.fromEntries(
  (Object.keys(t) as PageKey[]).map((k) => [
    k,
    { en: doc(t[k][0], 'This page is being written.'), zh: doc(t[k][1], '本页正在撰写中。') },
  ]),
) as Record<PageKey, Record<Lang, PageDoc>>;
