'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useGate } from '@/components/ComingSoon';
import { Modal } from '@/components/ui';
import { ZecGlyph } from '@/components/brand';
import { explorerAddr } from '@/lib/config';
import { shortZ } from './address';
import { ZecAmount } from './components';
import { DepositZecDialog } from './deposit';
import { useZT } from './i18n-hook';
import { useSproutAccount } from './provider';
import { SignInPanel, type SignInTab } from './signin';

/** Header control: "Start with Zcash" (passkey) + "BNB wallet"; an account chip with ZEC balance once connected. */
export function ConnectButton() {
  const { t } = useZT();
  const acct = useSproutAccount();
  const gate = useGate();
  const [modal, setModal] = useState<SignInTab | null>(null);
  const [menu, setMenu] = useState(false);
  const [deposit, setDeposit] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  if (!acct.ready) return <span className="skeleton inline-block h-8 w-32 rounded-full" aria-hidden />;

  if (acct.kind === 'none' || !acct.address) {
    return (
      <>
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn bg-gold py-1.5 text-ink hover:brightness-105" data-action="start-zcash" onClick={gate(() => setModal('zcash'))}>
            <ZecGlyph size={14} />
            <span className="whitespace-nowrap">{t('cb.start')}</span>
          </button>
          <button type="button" className="btn-ghost hidden py-1.5 xl:inline-flex" data-action="connect-bnb" onClick={gate(() => setModal('bnb'))}>
            {t('cb.bnb')}
          </button>
        </div>
        <Modal open={modal !== null} onClose={() => setModal(null)} title={t('si.title')} wide>
          {modal && <SignInPanel initial={modal} onDone={() => setModal(null)} />}
        </Modal>
      </>
    );
  }

  const addr = acct.address;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-full border border-line-2 bg-raised/70 py-1 pl-1.5 pr-3 text-sm transition hover:border-accent/60 hover:shadow-[0_0_0_4px_rgb(var(--accent)/0.1)]"
        onClick={() => setMenu((m) => !m)}
        aria-haspopup="menu"
        aria-expanded={menu}
      >
        <span className={`grid h-6 w-6 place-items-center rounded-full ${acct.kind === 'passkey' ? 'bg-gold/20' : 'bg-accent/20'}`}>
          {acct.kind === 'passkey' ? <ZecGlyph size={14} /> : <span className="h-2 w-2 rounded-full bg-accent" />}
        </span>
        <span className="font-medium">{acct.balanceWei !== undefined ? <ZecAmount wei={acct.balanceWei} /> : '…'}</span>
        <span className="hidden font-mono text-xs text-muted md:inline">{shortZ(addr, 4)}</span>
      </button>
      {menu && (
        <div role="menu" className="absolute right-0 z-[60] mt-2 w-72 max-w-[calc(100vw-2rem)] animate-fade-up overflow-hidden rounded-2xl border border-line-2 bg-card/95 p-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
          <div className="px-2.5 pb-2 pt-1.5">
            <div className="flex items-center gap-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
              <span aria-hidden className="status-dot" style={{ ['--dot' as string]: 'rgb(var(--bamboo))' }} />
              {acct.kind === 'passkey' ? t('cb.sproutAccount') : t('cb.bnbWallet')}
            </div>
            <div className="mt-1.5 text-xl font-semibold tracking-[-0.03em]">{acct.balanceWei !== undefined ? <ZecAmount wei={acct.balanceWei} showBnb /> : '—'}</div>
            <button
              type="button"
              className="mt-0.5 font-mono text-xs text-muted hover:text-fg"
              onClick={() =>
                navigator.clipboard?.writeText(addr).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  },
                  () => {},
                )
              }
            >
              {shortZ(addr, 8)} · {copied ? t('ui.copied') : t('ui.copy')}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 px-1 pb-2">
            <button type="button" className="btn bg-gold py-1.5 text-ink hover:brightness-105" onClick={gate(() => { setMenu(false); setDeposit(true); })}>
              {t('cb.deposit')}
            </button>
            <Link href="/zec#out" className="btn-ghost py-1.5" onClick={() => setMenu(false)}>
              {t('cb.withdraw')}
            </Link>
          </div>
          <div className="border-t border-line pt-1">
            <MenuLink href="/account" onClick={() => setMenu(false)}>{t('cb.account')}</MenuLink>
            <MenuLink href="/zec" onClick={() => setMenu(false)}>{t('cb.moveZec')}</MenuLink>
            <a role="menuitem" className="block rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-white/[0.05] hover:text-fg" href={explorerAddr(addr)} target="_blank" rel="noopener noreferrer">
              {t('cb.explorer')} ↗
            </a>
            <button role="menuitem" type="button" className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted hover:bg-down/[0.08] hover:text-down" onClick={() => { setMenu(false); acct.logout(); }}>
              {t('cb.signOut')}
            </button>
          </div>
        </div>
      )}
      <DepositZecDialog open={deposit} onClose={() => setDeposit(false)} />
    </div>
  );
}

function MenuLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick(): void }) {
  return (
    <Link role="menuitem" href={href} onClick={onClick} className="block rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-white/[0.05] hover:text-fg">
      {children}
    </Link>
  );
}
