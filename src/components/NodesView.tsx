'use client';

import { useMemo, useState } from 'react';
import { ZecAmount } from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import type { Key } from '@/i18n/dict';
import { explorerAddr, explorerTx } from '@/lib/config';
import { big, fmtAmt, fmtNum, shortAddr, timeAgo, weiToNum } from '@/lib/format';
import type { LedgerEntry, LedgerKind } from '@/lib/types';
import { useLedger } from '@/lib/useApi';
import { CopyChip, Kicker, NodeRing, StatusLine } from './fx';
import { useCopy } from './tradeCopy';
import { Empty, ErrorNote, ZecValue } from './ui';

const KINDS: LedgerKind[] = ['Flushed', 'Deposited', 'BurnRun', 'LiquidityRun', 'Settled', 'BridgedOut', 'CashOut'];
const DOT: Record<LedgerKind, string> = {
  Flushed: 'bg-accent',
  Deposited: 'bg-bamboo',
  BurnRun: 'bg-accent-deep',
  LiquidityRun: 'bg-bamboo-hi',
  Settled: 'bg-gold',
  BridgedOut: 'bg-gold',
  CashOut: 'bg-accent-hi',
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

const entryKey = (e: LedgerEntry) => `${e.tx}-${e.kind}-${e.source}-${JSON.stringify(e.values).length}`;

function KindLabel({ e }: { e: LedgerEntry }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[e.kind]}`} />
      <span className="truncate font-semibold">{t(`nodes.k.${e.kind}` as Key)}</span>
      {e.symbol && <span className="tag-yellow shrink-0 normal-case">${e.symbol}</span>}
    </span>
  );
}

export function NodesView() {
  const { t } = useI18n();
  const c = useCopy();
  const q = useLedger();
  const d = q.data;
  const [filter, setFilter] = useState<LedgerKind | 'all'>('all');
  const list = useMemo(() => (d?.entries ?? []).filter((e) => filter === 'all' || e.kind === filter), [d, filter]);
  const when = (e: LedgerEntry) => (e.ts ? timeAgo(e.ts, t) : `#${fmtNum(e.block)}`);

  return (
    <div className="space-y-6">
      {d && !d.ok && <ErrorNote onRetry={() => q.refetch()} detail={d.error} />}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker index={1}>{c('ledger')}</Kicker>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <StatusLine tone={d?.ok === false ? 'red' : 'green'} pulse={Boolean(d?.ok)}>
              BNB Chain
            </StatusLine>
            {d?.fromBlock !== null && d?.fromBlock !== undefined && (
              <span className="num font-mono text-[11px] text-faint">{t('nodes.range', { a: fmtNum(d.fromBlock), b: fmtNum(d.toBlock ?? 0) })}</span>
            )}
            {!q.isLoading && (
              <span className="num font-mono text-[11px] text-faint">
                <span className="text-muted">{list.length}</span> {c('events')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('nodes.filter')}>
        <button type="button" className={`chip ${filter === 'all' ? 'chip-on' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          {t('ex.all')}
        </button>
        {KINDS.map((k) => (
          <button key={k} type="button" className={`chip ${filter === k ? 'chip-on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[k]}`} />
            {t(`nodes.k.${k}` as Key)}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="box divide-y divide-line/60">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-5 py-4">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-4 flex-1" />
              <div className="skeleton hidden h-4 w-28 md:block" />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <Empty text={t('nodes.empty')} />
      ) : (
        <>
          {/* desktop: dense mono table */}
          <div className="box hidden overflow-x-auto md:block">
            <table className="table-tech">
              <thead>
                <tr>
                  <th className="pl-5">{c('event')}</th>
                  <th>{c('detail')}</th>
                  <th>{c('source')}</th>
                  <th className="num">{c('time')}</th>
                  <th className="pr-5 text-right">{c('tx')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={entryKey(e)}>
                    <td className="max-w-[16rem] pl-5">
                      <KindLabel e={e} />
                    </td>
                    <td className="num text-[13px] text-muted">
                      <Detail e={e} />
                    </td>
                    <td>
                      <a
                        className="font-mono text-[11px] text-faint transition hover:text-accent-hi"
                        href={explorerAddr(e.source)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {shortAddr(e.source)}
                      </a>
                    </td>
                    <td className="num whitespace-nowrap font-mono text-[11px] text-faint">{when(e)}</td>
                    <td className="pr-5 text-right">
                      <CopyChip value={e.tx} href={explorerTx(e.tx)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* phone: bamboo-stalk timeline */}
          <ol className="relative space-y-3 md:hidden">
            <span aria-hidden className="absolute bottom-3 left-[8.5px] top-3 w-px bg-gradient-to-b from-accent/50 via-line-2 to-bamboo/40" />
            {list.map((e) => (
              <li key={entryKey(e)} className="relative pl-7">
                <span aria-hidden className="absolute left-0 top-[18px] block">
                  <NodeRing tone={e.kind === 'Deposited' || e.kind === 'LiquidityRun' ? 'green' : 'yellow'} />
                </span>
                <div className="card min-w-0 p-3.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <KindLabel e={e} />
                    <span className="num shrink-0 font-mono text-[11px] text-faint">{when(e)}</span>
                  </div>
                  <div className="num mt-2 break-words text-[13px] text-muted">
                    <Detail e={e} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <a
                      className="font-mono text-[11px] text-faint transition hover:text-accent-hi"
                      href={explorerAddr(e.source)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {shortAddr(e.source)}
                    </a>
                    <CopyChip value={e.tx} href={explorerTx(e.tx)} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
