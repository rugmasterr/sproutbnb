'use client';

import { ZecAmount } from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import { big, fmtAmt, fmtNum, weiToNum } from '@/lib/format';
import type { StatsResponse } from '@/lib/types';
import { Stat, ZecValue } from './ui';

export function StatsRow({ s, loading }: { s?: StatsResponse; loading?: boolean }) {
  const { t } = useI18n();
  const l = loading || !s;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Stat label={t('stats.planted')} loading={l} value={fmtNum(s?.coinsPlanted ?? 0)} />
      <Stat label={t('stats.volume')} est hint={t('stats.volumeHint')} loading={l} value={<ZecAmount wei={big(s?.estVolumeWei)} />} />
      <Stat label={t('stats.holders')} loading={l} value={<ZecValue zecWei={s?.payouts?.zecToHoldersZecWei ?? '0'} />} />
      <Stat label={t('stats.liquidity')} loading={l} value={<ZecValue zecWei={s?.roots?.zecToLiquidityZecWei ?? '0'} />} />
      <Stat label={t('stats.burned')} loading={l} value={<span>{fmtAmt(weiToNum(s?.roots?.sproutBurnedWei ?? '0'))}</span>} />
      <Stat
        label={t('stats.zf')}
        est
        hint={t('stats.zfHint')}
        loading={l}
        value={<ZecAmount wei={big(s?.payouts?.bnbBridgedToFoundationWei)} />}
      />
    </div>
  );
}
