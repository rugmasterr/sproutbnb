'use client';

import { useCallback } from 'react';
import { useI18n } from '@/i18n/I18nProvider';

/** Bilingual string for landing-page-only visual copy. */
export type L = { en: string; zh: string };

/** Returns a picker for {en, zh} copy in the current language. */
export function useL() {
  const { lang } = useI18n();
  return useCallback((s: L) => (lang === 'zh' ? s.zh : s.en), [lang]);
}

export const C = {
  hero: {
    kicker: { en: 'ZEC · Zcash-native launchpad on BNB Chain', zh: 'ZEC · BNB 链上的 Zcash 原生发射台' },
    l1: { en: 'Plant on BNB.', zh: '在 BNB 链种下，' },
    l2: { en: 'Harvest in ZEC.', zh: '用 ZEC 收获。' },
    mainnet: { en: 'BNB Chain mainnet', zh: 'BNB 链主网' },
    testnet: { en: 'BNB Chain testnet', zh: 'BNB 链测试网' },
    flap: { en: 'Built on Flap', zh: '基于 Flap' },
    liveTag: { en: 'Live', zh: '运行中' },
    live: { en: 'Contracts verified on BNB Chain. Launches and trades settle in ZEC.', zh: '合约已在 BNB 链上验证，发币与交易均以 ZEC 结算。' },
    terminal: { en: 'Open terminal', zh: '打开终端' },
    stages: { en: 'Stages', zh: '成长阶段' },
    contract: { en: 'Sprout contract', zh: '春笋合约' },
    zecT: { en: 'Start from Zcash', zh: '从 Zcash 出发' },
    zecB: {
      en: 'Send ZEC from any Zcash wallet. It lands on BNB Chain in about ten minutes.',
      zh: '从任意 Zcash 钱包转入 ZEC，大约十分钟到账 BNB 链。',
    },
  },
  band: {
    label: { en: 'Live on Sprout', zh: '春笋实时动态' },
    live: { en: 'Live', zh: '实时' },
    facts: { en: 'Protocol facts', zh: '协议参数' },
    newCoin: { en: 'Planted', zh: '新种' },
    tax: { en: 'Trade tax', zh: '交易税' },
    grove: { en: 'Grove liquidity', zh: '竹林流动性' },
    root: { en: 'Rootstock burn', zh: '竹根销毁' },
    ops: { en: 'Sprout', zh: '春笋运营' },
    deployer: { en: 'Deployer’s choice', zh: '部署者自选' },
    inZec: { en: '0.80% in ZEC', zh: '0.80% · ZEC 支付' },
    supply: { en: 'Supply', zh: '总量' },
    chain: { en: 'Chain', zh: '链' },
    bridge: { en: 'Bridge', zh: '跨链' },
    cashout: { en: 'Cash out', zh: '提现' },
    shielded: { en: 'Native ZEC', zh: '原生 ZEC' },
    termFee: { en: 'Terminal fee', zh: '终端费' },
    stages: { en: 'Stages', zh: '阶段' },
  },
  how: {
    kicker: { en: 'How it works', zh: '运作方式' },
    t1: { en: 'Five nodes,', zh: '五个竹节，' },
    t2: { en: 'one stalk.', zh: '一根到底。' },
    sub: {
      en: 'From your Zcash wallet to a coin on BNB Chain and back again. Every step grows the stalk one node.',
      zh: '从你的 Zcash 钱包，到 BNB 链上的一枚币，再回到 Zcash。每走一步，竹子就长高一节。',
    },
    s: [
      { en: 'Fund with ZEC', zh: '用 ZEC 入金' },
      { en: 'Launch on Flap', zh: '在 Flap 上发币' },
      { en: '2% tax splits itself', zh: '2% 税自动分账' },
      { en: 'Seed → Shoot → Grove', zh: '笋芽 → 春笋 → 竹林' },
      { en: 'Cash out to Zcash, shielded', zh: '提现回 Zcash，可走屏蔽' },
    ],
    b2: {
      en: 'Pick a name, a picture and where your 0.80% goes. Sprout plants the coin through the Flap Portal with a fixed 1B supply.',
      zh: '取个名字、传张图，选好 0.80% 发给谁。春笋通过 Flap Portal 种下这枚币，总量固定 10 亿。',
    },
    b3: {
      en: 'Every buy and sell pays 2.00%: 0.50% to $SPROUT/ZEC liquidity, 0.50% to the Rootstock burn, 0.20% to Sprout and 0.80% to the deployer’s choice, paid in ZEC.',
      zh: '每笔买卖缴 2.00%：0.50% 注入 $SPROUT/ZEC 流动性，0.50% 进入竹根回购销毁，0.20% 归春笋运营，0.80% 按部署者的选择以 ZEC 发放。',
    },
    b4: {
      en: 'Every coin starts as a Seed on the bonding curve, grows into a Shoot, and graduates to PancakeSwap as part of the Grove once the curve fills.',
      zh: '每枚币都从联合曲线上的笋芽开始，长成春笋；曲线填满后毕业登陆 PancakeSwap，汇入竹林。',
    },
    r: [
      { en: 'ZEC → BNB Chain · ~10 min', zh: 'ZEC → BNB 链 · 约 10 分钟' },
      { en: 'Flap Portal · 1,000,000,000 supply', zh: 'Flap Portal · 总量 1,000,000,000' },
      { en: '2.00% → 0.50 · 0.50 · 0.20 · 0.80', zh: '2.00% → 0.50 · 0.50 · 0.20 · 0.80' },
      { en: 'Curve 0% → 100% → PancakeSwap', zh: '联合曲线 0% → 100% → PancakeSwap' },
      { en: 'Sell → t-addr / shielded / unified', zh: '卖出 → 透明 / 屏蔽 / 统一地址' },
    ],
    node: { en: 'Node', zh: '竹节' },
  },
  fee: {
    kicker: { en: 'Fee split', zh: '税费分账' },
    t1: { en: 'Two percent.', zh: '百分之二，' },
    t2: { en: 'Four roots.', zh: '分成四路。' },
    sub: {
      en: 'The tax is fixed for every Sprout coin and split on-chain by its vault. The largest share goes where the deployer decides.',
      zh: '每枚春笋币的税率固定，由各自的金库在链上分账。最大的一份，交给部署者决定去向。',
    },
    perTrade: { en: 'On every trade', zh: '每笔交易' },
    sub2: {
      en: 'Shares are of each trade’s value. Flap’s own protocol fee is separate.',
      zh: '以上比例均按每笔交易金额计算，Flap 自身的协议费另计。',
    },
    parts: [
      { en: 'Grove liquidity', zh: '竹林流动性', d: { en: 'Added to the $SPROUT/ZEC pool', zh: '注入 $SPROUT/ZEC 池' } },
      { en: 'Rootstock', zh: '竹根', d: { en: 'Buys $SPROUT and burns it', zh: '回购 $SPROUT 并销毁' } },
      { en: 'Sprout', zh: '春笋运营', d: { en: 'Keeps the lights on', zh: '维持平台运转' } },
      { en: 'Deployer’s choice', zh: '部署者自选', d: { en: 'Paid out in ZEC', zh: '以 ZEC 发放' } },
    ],
    choices: { en: 'Deployer’s choice · 0.80%', zh: '部署者自选 · 0.80%' },
    choicesSub: { en: 'Chosen at launch. Pick one:', zh: '发币时选定，五选一：' },
    zfOpen: { en: 'Address set', zh: '地址已设定' },
    permanent: { en: 'Permanent', zh: '永久' },
  },
  proto: {
    kicker: { en: 'Protocol', zh: '协议' },
    t1: { en: 'Read from the chain.', zh: '全部读自链上，' },
    t2: { en: 'Never typed in.', zh: '没有一个是手填的。' },
    pre: { en: 'Read live from BNB Chain', zh: '实时读取自 BNB 链' },
    cards: [
      {
        tag: 'WebAuthn · P-256',
        t: { en: 'Passkey accounts', zh: '通行密钥账户' },
        b: {
          en: 'Your Sprout Account is a smart account on BNB Chain unlocked by your device passkey. No seed phrase, no extension.',
          zh: 'Sprout 账户是 BNB 链上的智能账户，用设备通行密钥解锁。无需助记词，也无需浏览器插件。',
        },
      },
      {
        tag: '1Click',
        t: { en: 'NEAR Intents bridge', zh: 'NEAR Intents 跨链' },
        b: {
          en: 'ZEC moves between Zcash and BNB Chain through NEAR Intents, in about ten minutes each way.',
          zh: 'ZEC 经由 NEAR Intents 在 Zcash 与 BNB 链之间往返，单程大约十分钟。',
        },
      },
      {
        tag: 'zs · u1',
        t: { en: 'Shield forwarder', zh: '屏蔽转发器' },
        b: {
          en: 'Cash out to a shielded or unified address. Sprout’s forwarder delivers the ZEC with a stamp in the memo.',
          zh: '提现到屏蔽或统一地址时，由春笋的转发器送达 ZEC，并在备注里附上印章。',
        },
      },
      {
        tag: '0.50%',
        t: { en: 'Rootstock buy-back & burn', zh: '竹根回购销毁' },
        b: {
          en: 'A quarter of every tax buys $SPROUT on the open market and burns it for good.',
          zh: '每笔税收的四分之一用于在市场上回购 $SPROUT，并永久销毁。',
        },
      },
    ],
  },
  coins: {
    kicker: { en: 'Market', zh: '市场' },
    t1: { en: 'Fresh shoots.', zh: '新笋破土，' },
    t2: { en: 'Rising groves.', zh: '竹林成荫。' },
    emptyT: { en: 'Every coin, straight from the chain.', zh: '每一枚币，都直接读自链上。' },
  },
  road: {
    kicker: { en: 'Roadmap', zh: '路线图' },
    t1: { en: 'Node by node.', zh: '一节一节，' },
    t2: { en: 'No dates promised.', zh: '不许诺日期。' },
    full: { en: 'Full roadmap', zh: '完整路线图' },
    w: [
      { en: 'Built', zh: '已完成' },
      { en: 'Live', zh: '已上线' },
      { en: 'Now', zh: '现在' },
      { en: 'Next', zh: '下一步' },
      { en: 'Later', zh: '之后' },
    ],
    i: [
      { en: 'Contracts, site & services written', zh: '合约、网站与服务编写完成' },
      { en: 'Testnet → mainnet deploy', zh: '测试网 → 主网部署' },
      { en: '$SPROUT launch & first Grove run', zh: '$SPROUT 发行与首次竹林注入' },
      { en: 'Flap partner audit & Zcash Foundation option', zh: 'Flap 合作审计与 Zcash 基金会选项' },
      { en: 'Native-ZEC payouts & account audit', zh: '原生 ZEC 发放与账户合约审计' },
    ],
  },
  cta: {
    kicker: { en: 'Launch', zh: '发币' },
    t1: { en: 'Launch your shoot.', zh: '种下你的春笋。' },
    t2: { en: 'Grow the grove.', zh: '雨后春笋，从这一棵开始。' },
    steps: [
      { en: 'Name it and add a picture', zh: '起个名字，传张图' },
      { en: 'Choose where the 0.80% goes', zh: '选好 0.80% 的去向' },
      { en: 'Plant it on Flap, pay in ZEC', zh: '用 ZEC 在 Flap 上种下' },
    ],
  },
} as const;
