'use client';

import { useMemo, useState } from 'react';
import { ZecAmount } from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import type { Key } from '@/i18n/dict';
import { explorerAddr, explorerTx } from '@/lib/config';
import { big, fmtAmt, fmtNum, shortAddr, timeAgo, weiToNum } from '@/lib/format';
import type { LedgerEntry, LedgerKind } from '@/lib/types';
import { useLedger } from '@/lib/useApi';
import { Empty, ErrorNote, PrelaunchBanner, ZecValue } from './ui';

const KINDS: LedgerKind[] = ['Flushed', 'Deposited', 'BurnRun', 'LiquidityRun', 'Settled', 'BridgedOut', 'CashOut'];
const DOT: Record<LedgerKind, string> = {
  Flushed: 'bg-accent',
  Deposited: 'bg-bamboo-500',
  BurnRun: 'bg-seal',
  LiquidityRun: 'bg-leaf-200',
  Settled: 'bg-gold',
  BridgedOut: 'bg-gold',
  CashOut: 'bg-gold',
};

function Detail({ e }: { e: LedgerEntry }) {
  const v = e.values;
  const W = ({ k }: { k: string }) => <ZecAmount wei={big(v[k])} />;
  switch (e.kind) {
    case 'Flushed':
      return (
        <span className="flex flex-wrap gap-x-3">
          <span>
            LP <W k="toLiquidity" />
          </span>
          <span>
            Root <W k="toRootstock" />
          </span>
          <span>
            Ops <W k="toOps" />
          </span>
          <span>
            Payee <W k="toPayee" />
          </span>
        </span>
      );
    case 'Deposited':
      return (
        <span className="flex flex-wrap gap-x-3">
          <span>
            LP <W k="lpAmount" />
          </span>
          <span>
            Root <W k="rootAmount" />
          </span>
        </span>
      );
    case 'BurnRun':
      return (
        <span>
          <W k="bnbIn" /> → {fmtAmt(weiToNum(v.sproutBurned))} $SPROUT burned
        </span>
      );
    case 'LiquidityRun':
      return (
        <span>
          <W k="bnbIn" /> → <ZecValue zecWei={v.zecIn} /> + {fmtAmt(weiToNum(v.sproutIn))} $SPROUT
        </span>
      );
    case 'Settled':
      return (
        <span>
          <W k="bnbIn" /> → <ZecValue zecWei={v.zecOut} /> {v.to && <span className="font-mono text-xs">→ {shortAddr(v.to)}</span>}
        </span>
      );
    case 'BridgedOut':
      return (
        <span>
          <W k="bnbIn" /> → Zcash {v.zcashAddress && <span className="break-all font-mono text-xs">{shortAddr(v.zcashAddress, 6)}</span>}
        </span>
      );
    case 'CashOut':
      return (
        <span>
          <W k="bnbOut" /> → Zcash {v.trader && <span className="font-mono text-xs">({shortAddr(v.trader)})</span>}
        </span>
      );
  }
}

export function NodesView() {
  const { t } = useI18n();
  const q = useLedger();
  const d = q.data;
  const [filter, setFilter] = useState<LedgerKind | 'all'>('all');
  const list = useMemo(() => (d?.entries ?? []).filter((e) => filter === 'all' || e.kind === filter), [d, filter]);

  return (
    <div className="space-y-6">
      {d && !d.configured && <PrelaunchBanner />}
      {d && !d.ok && <ErrorNote onRetry={() => q.refetch()} detail={d.error} />}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`chip ${filter === 'all' ? 'chip-on' : ''}`} onClick={() => setFilter('all')}>
          {t('ex.all')}
        </button>
        {KINDS.map((k) => (
          <button key={k} type="button" className={`chip ${filter === k ? 'chip-on' : ''}`} onClick={() => setFilter(k)}>
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[k]}`} />
            {t(`nodes.k.${k}` as Key)}
          </button>
        ))}
      </div>
      {d?.fromBlock !== null && d?.fromBlock !== undefined && (
        <p className="text-xs text-faint">{t('nodes.range', { a: fmtNum(d.fromBlock), b: fmtNum(d.toBlock ?? 0) })}</p>
      )}
      {q.isLoading ? (
        <div className="skeleton h-64 w-full" />
      ) : list.length === 0 ? (
        <Empty text={t('nodes.empty')} />
      ) : (
        <ol className="relative space-y-0 border-l border-line pl-5">
          {list.map((e) => (
            <li key={`${e.tx}-${e.kind}-${e.source}-${JSON.stringify(e.values).length}`} className="relative py-3">
              <span className={`absolute -left-[26px] top-[18px] h-3 w-3 rounded-full ring-4 ring-bg ${DOT[e.kind]}`} aria-hidden />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold">{t(`nodes.k.${e.kind}` as Key)}</span>
                {e.symbol && <span className="chip py-0">${e.symbol}</span>}
                <span className="text-xs text-faint">{e.ts ? timeAgo(e.ts, t) : `#${fmtNum(e.block)}`}</span>
                <a className="link ml-auto text-xs" href={explorerTx(e.tx)} target="_blank" rel="noopener noreferrer">
                  BscScan ↗
                </a>
              </div>
              <div className="num mt-1 text-sm text-muted">
                <Detail e={e} />
              </div>
              <a className="mt-0.5 block font-mono text-[11px] text-faint hover:text-muted" href={explorerAddr(e.source)} target="_blank" rel="noopener noreferrer">
                {shortAddr(e.source)}
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
