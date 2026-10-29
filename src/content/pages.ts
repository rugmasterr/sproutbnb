// Sprout (春笋) — long-form page content (docs, about, guide, roadmap, risk, terms).
// Derived strictly from SPEC.md v2 (Zcash-native). Bilingual: English + Simplified Chinese.
// Inline markup inside strings: **bold**, `code`, [text](href). Internal links only.

export type Lang = 'en' | 'zh';
export type Block = { h?: string; p?: string[]; ul?: string[]; table?: { head: string[]; rows: string[][] }; note?: string };
export type PageDoc = {
  title: string;
  lead: string;
  sections: { id: string; heading: string; blocks: Block[] }[];
  faq?: { q: string; a: string }[];
};
export type PageKey = 'docs' | 'about' | 'guide' | 'roadmap' | 'risk' | 'terms';

/* ------------------------------------------------------------------ */
/* DOCS                                                                */
/* ------------------------------------------------------------------ */

const docsEn: PageDoc = {
  title: "Docs",
  lead:
    "How Sprout works, end to end. Sprout is a Zcash-native launchpad and terminal on BNB Chain, built on Flap: you fund from a Zcash wallet, everything is shown in ZEC, rewards and payouts are paid in ZEC, and you can cash out straight back to Zcash.",
  sections: [
    {
      id: "launching",
      heading: "Launching a coin",
      blocks: [
        {
          p: [
            "Launching is **one transaction**. It creates a real Flap Tax Token (V3) on Flap's bonding curve, sets a fixed **2% buy / 2% sell tax**, deploys the coin's own Sprout vault, and records where the deployer's 0.80% share goes. Sprout adds no launch fee: you pay gas, your optional first buy, and any creation fee Flap itself charges.",
            "Start on [Launch](/launch). You pick a name, a ticker, an image and a short description, then choose who receives the deployer's share (see [Deployer's 0.80%](/docs#deployer-share)).",
          ],
        },
        {
          ul: [
            "**Name and ticker**: keep both short; the ticker has no spaces. The launch form shows the length limits.",
            "**Address**: every coin address ends in `7777` (a vanity salt Sprout computes for you before launch).",
            "**Image and metadata** are uploaded to Flap's metadata service (IPFS) during the launch flow.",
            "**First buy** (optional): you can buy the first tokens in the same transaction. With a Sprout Account the first buy can be **paid in ZEC** — bring ZEC in from your Zcash wallet first; it arrives as BNB in your account and the launch spends it.",
          ],
        },
        {
          note:
            "The tax rate and the split are fixed when the coin is created. Neither you nor Sprout can raise the tax later.",
        },
      ],
    },
    {
      id: "accounts",
      heading: "Accounts",
      blocks: [
        { h: "Start with your Zcash wallet (recommended)" },
        {
          p: [
            "Paste your Zcash address and create a **Sprout Account**: a smart account on BNB Chain controlled by a **passkey** (Face ID, Touch ID, Windows Hello or a security key). The account address is derived from your passkey, so it exists before it is ever deployed; it is deployed automatically with your first action.",
            "You give Sprout a **transparent address** (`t1…`/`t3…`) for refunds, and optionally a **shielded or unified address** (`zs…`/`u1…`) for shielded payouts.",
            "When you trade or launch, your passkey signs and Sprout's **relayer** submits the transaction. The relayer is reimbursed for gas from your account's balance inside the same transaction — gas only, no markup. You never need to hold BNB separately for gas.",
          ],
        },
        {
          note:
            "**Your passkey is the only key to your Sprout Account.** There is no recovery, no seed phrase and no support override. If you lose the passkey, the account and everything in it is lost. Use a passkey that syncs (iCloud Keychain, Google Password Manager or a password manager that supports passkeys), and keep balances small until you are comfortable.",
        },
        { h: "Or use a BNB wallet" },
        {
          p: [
            "MetaMask, Binance Wallet, OKX Wallet, TokenPocket or any injected BNB Chain wallet works too. You get the same features, pay gas yourself in BNB, and can still move ZEC in and out on [Move ZEC](/zec).",
          ],
        },
      ],
    },
    {
      id: "stages",
      heading: "Stages",
      blocks: [
        {
          table: {
            head: ["Stage", "Meaning"],
            rows: [
              ["**Seed** 笋芽", "Just planted — curve progress below 2%."],
              ["**Shoot** 春笋", "Trading on Flap's bonding curve. Shown as “about to graduate” from 70% progress."],
              ["**Grove** 竹林", "Graduated: 80% of the total supply has been bought from the curve and Flap migrates the coin to PancakeSwap V2."],
            ],
          },
        },
        {
          p: [
            "The 2% tax applies at every stage, on the curve and after graduation, so the coin's vault keeps earning for as long as it trades.",
          ],
        },
      ],
    },
    {
      id: "fees",
      heading: "Fee breakdown",
      blocks: [
        {
          p: [
            "Every buy and sell of a Sprout coin pays a **2.00% tax** in BNB. The coin's vault splits it like this:",
          ],
        },
        {
          table: {
            head: ["Share", "Goes to", "What happens"],
            rows: [
              ["0.50%", "Liquidity — **The Grove**", "Builds the shared $SPROUT/ZEC pool; LP tokens are burned. Backs no individual coin."],
              ["0.50%", "**Rootstock**", "Buys $SPROUT and burns it."],
              ["0.20%", "Sprout operations", "Pays for the keeper, relayer, indexer and hosting."],
              ["0.80%", "**Deployer's choice**, paid in ZEC", "Me, another wallet, holders, a Zcash wallet, or the Zcash Foundation."],
              ["**2.00%**", "Total", ""],
            ],
          },
        },
        {
          note:
            "The percentages above are nominal shares of trade volume. Flap first takes its tax-token protocol rate out of the 2% (see [Flap fees](/docs#flap-fees)), and Flap's integrator commission on the remainder goes to Rootstock. The vault splits whatever it actually receives 25 / 25 / 10 / 40, so each real share is somewhat smaller than shown.",
        },
      ],
    },
    {
      id: "deployer-share",
      heading: "The deployer's 0.80%",
      blocks: [
        {
          p: [
            "At launch the deployer chooses one destination for the 0.80% share. Everything is **paid in ZEC**: the vault collects BNB, and Sprout's keeper converts it.",
          ],
        },
        { h: "Me" },
        {
          p: [
            "Paid to the deployer's address on BNB Chain as **BEP-20 ZEC** (Binance-Peg ZEC). The keeper swaps BNB for ZEC on PancakeSwap V3 with a minimum-out check, then transfers it.",
          ],
        },
        { h: "Another wallet" },
        {
          p: [
            "Same as above, but to any BNB Chain address you enter. The current payee can redirect the share to a new address.",
          ],
        },
        { h: "Holders" },
        {
          p: [
            "The share becomes **ZEC rewards for holders** (持币分红), paid as BEP-20 ZEC. Holders need a minimum holding to qualify (default 100,000 tokens). The keeper deposits the ZEC into the coin's Flap dividend tracker, and holders claim their rewards.",
          ],
        },
        {
          note:
            "If the coin's Flap dividend tracker cannot accept the ZEC (for example, before anyone holds enough to qualify), the ZEC is kept for that coin's holders instead. Sprout's keeper then periodically takes a snapshot of qualifying holders, publishes it on-chain, and holders claim pro-rata. Unclaimed ZEC returns to the same coin's holder pool after 90 days for a later round, never to Sprout. The snapshot is computed by Sprout, so this fallback relies on the keeper (see [Keys & control](/docs#keys)).",
        },
        { h: "A Zcash wallet" },
        {
          p: [
            "Paid as **native ZEC on Zcash** to a transparent (`t1…`/`t3…`) or shielded/unified (`zs…`/`u1…`) address. The BNB pot is bridged through NEAR Intents 1Click once it reaches about **0.25 ZEC**, or after 7 days if it holds at least about **0.01 ZEC**. Each delivery pays 1Click's fees, which is why small pots wait.",
            "Shielded and unified addresses are delivered through Sprout's forwarder (see [ZEC between Sprout and Zcash](/docs#zec-bridge)).",
            "The current controller (the creator, at first) can change the Zcash address or **hand over control** to another BNB address — after which only the new controller can redirect it.",
          ],
        },
        { h: "Zcash Foundation" },
        {
          p: [
            "A **permanent donation** to the Zcash Foundation in native ZEC, delivered the same way as the Zcash wallet option. It cannot be redirected later. Every donation is logged on-chain against the coin, and if the Foundation's address is shielded or unified, each delivery also carries a [stamp](/docs#stamps) that links it to that on-chain record.",
          ],
        },
        {
          note:
            "This option is **disabled until the Foundation's donation address has been set on-chain and verified**. Sprout will never guess or hard-code it. Sprout is not affiliated with, or endorsed by, the Zcash Foundation.",
        },
      ],
    },
    {
      id: "grove",
      heading: "The Grove",
      blocks: [
        {
          p: [
            "The Grove (竹林) is one shared, protocol-owned **$SPROUT/ZEC** pool on PancakeSwap V2. Every Sprout coin's 0.50% liquidity share flows into it.",
            "On each liquidity run the keeper takes BNB from the pot, swaps half to ZEC (PancakeSwap V3) and half to $SPROUT (Flap), adds both as liquidity, and sends the LP tokens to the burn address `0x…dEaD`. The whole run is one atomic transaction.",
          ],
        },
        {
          ul: [
            "Each run draws at most **0.5 BNB**.",
            "Runs are at least **300 seconds** apart.",
            "Because the LP is burned, nobody — including Sprout — can withdraw it.",
          ],
        },
        {
          note:
            "The Grove deepens $SPROUT/ZEC. It **backs no single coin** and does not guarantee liquidity for anything you launch or buy.",
        },
      ],
    },
    {
      id: "rootstock",
      heading: "Rootstock: buy & burn",
      blocks: [
        {
          p: [
            "Rootstock (竹根) buys $SPROUT on Flap and sends it to `0x…dEaD` (回购销毁). It is funded by three streams:",
          ],
        },
        {
          ul: [
            "The **0.50%** rootstock share of every Sprout coin's tax.",
            "Flap's **integrator commission** on Sprout coins (Sprout's contract is the commission receiver).",
            "The **0.25%** rootstock share of every [Terminal](/terminal) trade.",
          ],
        },
        {
          p: [
            "The same limits apply: at most 0.5 BNB per burn run, at least 300 seconds between runs, and a minimum-out check on every swap.",
          ],
        },
      ],
    },
    {
      id: "zec-bridge",
      heading: "ZEC between Sprout and Zcash",
      blocks: [
        {
          p: [
            "Native ZEC moves between Zcash and BNB Chain through **NEAR Intents 1Click**. 1Click swaps ZEC on Zcash to BNB on BNB Chain and back. (It does not list BEP-20 ZEC, so the BNB Chain side of every bridge is BNB.)",
          ],
        },
        { h: "Bringing ZEC in" },
        {
          ul: [
            "Sprout requests a quote and shows you a **one-time deposit address**, an **exact amount**, a **deadline** and a QR code.",
            "Send exactly that amount, once, from your Zcash wallet. Never reuse a deposit address.",
            "It usually completes in about 10 minutes. The BNB lands in your Sprout Account and is shown to you in ZEC at the live rate.",
            "If the deposit is short, late or the swap cannot be completed, refunds start after the deadline (about **80 minutes**). Refunds go to **your transparent address**, minus a small 1Click refund fee.",
          ],
        },
        { h: "Cashing out to Zcash" },
        {
          p: [
            "When you sell, choose **Receive as native ZEC on Zcash**. The sale and the 1Click deposit happen in the **same transaction** — if the trade fails, nothing is sent. Funds arrive at your transparent address.",
          ],
        },
        { h: "Shielded payouts" },
        {
          p: [
            "1Click delivers to **transparent Zcash addresses only**. To receive into a shielded or unified address, 1Click delivers to Sprout's **shield forwarder**, a Zcash wallet run by Sprout, which then sends to your shielded address with a [stamp](/docs#stamps) in the memo.",
          ],
        },
        {
          ul: [
            "Limits: at most **100 ZEC per payout**, and at most **1,000 ZEC** and **2,000 payouts per day** across all of Sprout.",
            "The forwarder holds your ZEC for **minutes**, but during that time Sprout has custody of it. You are trusting Sprout to forward it.",
          ],
        },
        {
          note:
            "Until Sprout has a 1Click partner key, requests are unauthenticated and 1Click charges an extra **0.25%** per swap (with a key, 1Click's partner rate applies instead). Every quote shows the amount you will receive before you send anything.",
        },
      ],
    },
    {
      id: "stamps",
      heading: "Stamps",
      blocks: [
        {
          p: [
            "A stamp (印章) is a receipt written into the encrypted memo of a shielded payout: `sprout-stamp:v1:<payoutId>:<bsc tx hash>`. It ties the ZEC you received to the public BNB Chain transaction that paid it, so you can prove where a payment came from without revealing anything else.",
            "Only someone who can decrypt your shielded transactions can read a stamp.",
          ],
        },
        {
          note:
            "To let someone check your stamps you would share a **viewing key**. A viewing key reveals **all** payments to that address, not just Sprout's. Share it only with someone you fully trust.",
        },
      ],
    },
    {
      id: "terminal",
      heading: "Terminal",
      blocks: [
        {
          p: [
            "The [Terminal](/terminal) trades **any Flap token**, not only Sprout coins. It charges **1%** on the BNB side of each trade: **0.25%** to Rootstock and **0.75%** to Sprout. You can cash out a terminal sale to Zcash in the same transaction.",
            "Sprout coins themselves are traded directly through Flap on their coin page, with no terminal fee.",
          ],
        },
        {
          ul: [
            "A built-in guard refuses tokens Flap marks as invalid and tokens whose buy or sell tax is above **5%**.",
            "Passing the guard means only that. Sprout **never calls a token safe**.",
          ],
        },
      ],
    },
    {
      id: "nodes",
      heading: "Nodes: the public ledger",
      blocks: [
        {
          p: [
            "[Nodes](/nodes) (竹节) is a public ledger built only from on-chain events: coins planted, vault flushes, ZEC payouts to payees and holders, bridges to Zcash (with the 1Click deposit address and quote reference), Grove liquidity runs and Rootstock burns. Every row links to its transaction, so anyone can check it.",
            "Aggregate numbers are on [Stats](/stats). Everything on these pages is read from BNB Chain — never sample data.",
          ],
        },
      ],
    },
    {
      id: "sprout-token",
      heading: "$SPROUT",
      blocks: [
        {
          p: [
            "$SPROUT is the platform token. Rootstock buys and burns it, and the Grove pairs it with ZEC.",
            "**The official $SPROUT contract address is published only on this site,** after it is set (once only) in Sprout's Roots contract. Treat any token claiming to be $SPROUT that is not listed here as fake.",
          ],
        },
        { note: "Nothing here is a promise of price, returns or utility beyond what is described on this page." },
      ],
    },
    {
      id: "keys",
      heading: "Keys & control",
      blocks: [
        { p: ["Sprout is not trustless. These are the roles that exist and what each can and cannot do:"] },
        {
          table: {
            head: ["Role", "Can", "Cannot"],
            rows: [
              [
                "**Admin**",
                "Change the operations treasury address; hand admin to a new address; set $SPROUT in Roots (once); set the Zcash Foundation address (once); change the keeper.",
                "Upgrade vault code, change any coin's tax or split, move vault pots elsewhere, touch your account.",
              ],
              [
                "**Keeper** (automated service)",
                "Trigger flushes; run Grove and Rootstock runs (≤ 0.5 BNB, ≥ 300 s apart); convert payee pots to ZEC with a minimum-out check; bridge Zcash payouts (≤ 1 BNB per call); publish holder-reward snapshots when the fallback distributor is in use.",
                "Pay a “Me” or “Another wallet” share to anyone but the payee; withdraw BNB or ZEC to itself; skip minimum-out checks.",
              ],
              [
                "**Relayer**",
                "Submit transactions your passkey signed and take the signed gas reimbursement.",
                "Change what you signed (calls, deadline, gas fee and fee recipient are all covered by your signature). It can delay or refuse to relay.",
              ],
              [
                "**Forwarder**",
                "Hold ZEC for minutes while forwarding shielded payouts.",
                "Exceed the shielded limits. While it holds ZEC, it is custodial.",
              ],
              [
                "**Flap Guardian**",
                "Upgrade all Sprout vaults through their beacon; act as keeper; redirect a payee in an emergency.",
                "—",
              ],
            ],
          },
        },
        { h: "Zcash payouts: the trust point" },
        {
          p: [
            "For the Zcash wallet and Zcash Foundation options, the keeper requests a 1Click quote and sends the BNB to the **deposit address that quote returns**. The contract cannot verify off-chain that a deposit address really belongs to a 1Click quote for the right recipient — so the keeper is trusted here.",
            "To make that checkable, every bridge is logged on-chain (`BridgedOut`) with the vault, amount, deposit address, quote reference and destination Zcash address. Anyone can look the deposit address up with 1Click's public status endpoint (`/v0/status`) and confirm where it delivered. Each call is capped at 1 BNB, and all of it appears on [Nodes](/nodes).",
            "The holder-reward fallback is the other trust point: the keeper computes each snapshot off-chain and publishes only its root on-chain. Each holder's claim and proof can be checked against that root, but nothing on-chain checks that the snapshot itself is correct.",
          ],
        },
      ],
    },
    {
      id: "flap-fees",
      heading: "Flap fees",
      blocks: [
        {
          p: [
            "Sprout coins are Flap coins, so Flap's own protocol fees apply on top of the coin's tax:",
          ],
        },
        {
          ul: [
            "**1%** on bonding-curve trades on BNB Chain.",
            "A tax-token protocol rate of **up to 0.3%** of trade volume, taken from the tax before it reaches the vault.",
            "After graduation, PancakeSwap's pool fee applies to DEX trades.",
          ],
        },
        { p: ["Sprout adds no launch fee. Its only income is the 0.20% operations share and the 0.75% Terminal share."] },
      ],
    },
    {
      id: "risks",
      heading: "Risks",
      blocks: [
        {
          ul: [
            "Most memecoins go to zero. Only use money you can afford to lose.",
            "Sprout's contracts are **not audited**.",
            "Bridging relies on NEAR Intents; BEP-20 ZEC relies on Binance's custody.",
            "Lose your passkey, lose your Sprout Account.",
            "Refunds go to a transparent address, and everything on BNB Chain is public.",
          ],
        },
        { p: ["Read the full [risk disclosure](/risk) before using Sprout."] },
      ],
    },
  ],
  faq: [
    {
      q: "Do I need ZEC?",
      a: "No. ZEC is the main way in, but a BNB wallet works for everything too — launching, trading and the Terminal.",
    },
    {
      q: "Do I need BNB for gas?",
      a: "Not with a Sprout Account. The relayer pays gas and is reimbursed from your account's balance in the same transaction, with no markup. With a BNB wallet you pay gas yourself.",
    },
    {
      q: "Is bridged ZEC private?",
      a: "No. The 1Click leg on Zcash uses transparent addresses, and BNB, BEP-20 ZEC and everything on BNB Chain is public. Only the final shielded payout from Sprout's forwarder is private.",
    },
    {
      q: "Which Zcash wallets work?",
      a: "Any Zcash wallet that can send to a transparent address. For refunds you need a transparent address of your own; for shielded payouts you need a wallet with a shielded or unified address. Sprout has no wallet partnerships.",
    },
    {
      q: "Can the operator take my coins?",
      a: "Sprout cannot sign for your Sprout Account — only your passkey can — and cannot change a coin's tax or redirect a payee to a BNB address of its choosing. Sprout is trusted for Zcash payouts (the keeper chooses the 1Click deposit address, logged on-chain), for holder-reward snapshots if the fallback distributor is used, and while the forwarder briefly holds shielded payouts. Flap's Guardian can upgrade vault code. See [Keys & control](/docs#keys).",
    },
    {
      q: "What happens at graduation?",
      a: "When 80% of the total supply has been bought from the curve, Flap migrates the coin to PancakeSwap V2. The 2% tax and the vault keep working after graduation.",
    },
    {
      q: "Can the tax change?",
      a: "No. 2% buy and 2% sell are fixed in the token at launch, for a tax duration of about 100 years.",
    },
    {
      q: "What if I lose my passkey?",
      a: "Your Sprout Account is gone. There is no recovery. Use a synced passkey and keep balances you could not afford to lose in a wallet you control.",
    },
  ],
};

const docsZh: PageDoc = {
  title: "文档",
  lead:
    "春笋的完整运作方式。春笋是 BNB 链上首个 Zcash 原生的发射平台与交易终端，基于 Flap 构建：从 Zcash 钱包充值，全程以 ZEC 计价，奖励和分成以 ZEC 发放，卖出后可直接提现回 Zcash。",
  sections: [
    {
      id: "launching",
      heading: "发射代币",
      blocks: [
        {
          p: [
            "发射只需 **一笔交易**：在 Flap 内盘上创建一枚真正的 Flap 税费代币（V3），设定固定的 **买入 2% / 卖出 2% 税费**，为该币部署专属的春笋金库，并记录部署者 0.80% 分成的去向。春笋不收发射费：你只需支付 Gas、可选的首笔买入，以及 Flap 自身可能收取的创建费。",
            "在 [发射](/launch) 页面填写名称、代币符号、图片和简介，然后选择部署者分成的接收方（见 [部署者的 0.80%](/docs#deployer-share)）。",
          ],
        },
        {
          ul: [
            "**名称与代币符号**：都应尽量简短，代币符号不能含空格。发射表单会显示长度限制。",
            "**合约地址**：每枚币的合约地址都以 `7777` 结尾（春笋会在发射前为你计算靓号盐值）。",
            "**图片与元数据** 在发射流程中上传至 Flap 的元数据服务（IPFS）。",
            "**首笔买入**（可选）：可在同一笔交易中买入首批代币。使用 Sprout 账户时，首笔买入可 **用 ZEC 支付** —— 先从 Zcash 钱包充入 ZEC，到账后以 BNB 形式存于账户中，发射时直接使用。",
          ],
        },
        { note: "税率和分配比例在创建时即已固定，你和春笋之后都无法调高税费。" },
      ],
    },
    {
      id: "accounts",
      heading: "账户",
      blocks: [
        { h: "用 Zcash 钱包开始（推荐）" },
        {
          p: [
            "粘贴你的 Zcash 地址，创建一个 **Sprout 账户**：一个由 **通行密钥**（Face ID、Touch ID、Windows Hello 或硬件安全密钥）控制的 BNB 链智能账户。账户地址由你的通行密钥推导而来，部署前就已确定；首次操作时会自动部署。",
            "你需要提供一个 **透明地址**（`t1…`/`t3…`）用于退款，并可选填一个 **屏蔽地址或统一地址**（`zs…`/`u1…`）用于隐私提现。",
            "交易或发射时，由你的通行密钥签名，春笋的 **中继器** 代为提交交易。中继器在同一笔交易中从你的账户余额中报销 Gas —— 只收 Gas，不加价。你无需另外准备 BNB 作为 Gas。",
          ],
        },
        {
          note:
            "**通行密钥是你 Sprout 账户的唯一钥匙。** 没有找回功能、没有助记词，客服也无法介入。一旦丢失通行密钥，账户及其中所有资产都将永久丢失。请使用可同步的通行密钥（iCloud 钥匙串、Google 密码管理器或支持通行密钥的密码管理器），在熟悉之前只存放少量资金。",
        },
        { h: "或使用 BNB 钱包" },
        {
          p: [
            "MetaMask、币安钱包、OKX 钱包、TokenPocket 或任何浏览器注入式 BNB 链钱包均可使用。功能完全相同，Gas 由你自己用 BNB 支付，也可以在 [Move ZEC](/zec) 页面转入、转出 ZEC。",
          ],
        },
      ],
    },
    {
      id: "stages",
      heading: "阶段",
      blocks: [
        {
          table: {
            head: ["阶段", "含义"],
            rows: [
              ["**笋芽** Seed", "刚刚种下 —— 内盘进度低于 2%。"],
              ["**春笋** Shoot", "在 Flap 内盘交易中。进度达到 70% 起显示为「即将毕业」。"],
              ["**竹林** Grove", "已毕业：总供应量的 80% 在内盘售出后，Flap 将代币迁移至 PancakeSwap V2 外盘。"],
            ],
          },
        },
        { p: ["2% 税费在每个阶段都有效，内盘和外盘均适用，只要代币还在交易，金库就会持续产生收入。"] },
      ],
    },
    {
      id: "fees",
      heading: "费用明细",
      blocks: [
        { p: ["每笔买入和卖出春笋代币都需支付 **2.00% 税费**（以 BNB 计），由该币的金库按如下比例分配："] },
        {
          table: {
            head: ["比例", "去向", "用途"],
            rows: [
              ["0.50%", "流动性 —— **竹林**", "注入共享的 $SPROUT/ZEC 池，LP 代币销毁。不为任何单一代币背书。"],
              ["0.50%", "**竹根**", "回购 $SPROUT 并销毁。"],
              ["0.20%", "春笋运营", "用于守护程序、中继器、索引器和服务器开销。"],
              ["0.80%", "**部署者自选**，以 ZEC 发放", "我自己、其他钱包、持币者、Zcash 钱包或 Zcash 基金会。"],
              ["**2.00%**", "合计", ""],
            ],
          },
        },
        {
          note:
            "上表为按交易额计的名义比例。Flap 会先从 2% 税费中扣除税费代币协议费率（见 [Flap 费用](/docs#flap-fees)），剩余部分中 Flap 支付的集成方佣金进入竹根。金库再将实际收到的部分按 25 / 25 / 10 / 40 分配，因此各项实际比例会略低于上表。",
        },
      ],
    },
    {
      id: "deployer-share",
      heading: "部署者的 0.80%",
      blocks: [
        { p: ["发射时，部署者为 0.80% 的分成选择一个去向。全部 **以 ZEC 发放**：金库先收取 BNB，再由春笋的守护程序完成兑换。"] },
        { h: "我自己" },
        {
          p: [
            "以 **BEP-20 ZEC**（Binance-Peg ZEC）发放到部署者在 BNB 链上的地址。守护程序在 PancakeSwap V3 上将 BNB 兑换为 ZEC（带最低输出保护），然后转账。",
          ],
        },
        { h: "其他钱包" },
        { p: ["同上，但发放到你填写的任意 BNB 链地址。当前收款人可以将分成改到新地址。"] },
        { h: "持币者" },
        {
          p: [
            "这部分分成变为 **持币分红（ZEC）**，以 BEP-20 ZEC 发放。持币者需达到最低持仓才有资格（默认 100,000 枚）。守护程序将 ZEC 存入该币的 Flap 分红追踪合约，持币者自行领取。",
          ],
        },
        {
          note:
            "如果该币的 Flap 分红追踪合约无法接收 ZEC（例如还没有人达到最低持仓），这部分 ZEC 会留给该币的持币者。春笋的守护程序随后定期对符合条件的持币者做快照并发布到链上，持币者按比例领取。90 天内未领取的 ZEC 会退回同一枚币的分红池，留待下一轮发放，绝不归春笋所有。快照由春笋计算，因此这一备用方案依赖守护程序（见 [密钥与控制权](/docs#keys)）。",
        },
        { h: "Zcash 钱包" },
        {
          p: [
            "以 **Zcash 原生 ZEC** 发放到透明地址（`t1…`/`t3…`）或屏蔽/统一地址（`zs…`/`u1…`）。BNB 奖池累积到约 **0.25 ZEC** 时通过 NEAR Intents 1Click 跨链发出；或在至少有约 **0.01 ZEC** 时满 7 天后发出。每次跨链都需支付 1Click 的费用，所以小额奖池会先等待累积。",
            "屏蔽地址和统一地址通过春笋的转发器送达（见 [ZEC 在春笋与 Zcash 之间流转](/docs#zec-bridge)）。",
            "当前控制人（初始为创建者）可以更改 Zcash 地址，或将 **控制权移交** 给另一个 BNB 地址 —— 移交后，只有新控制人可以修改。",
          ],
        },
        { h: "Zcash 基金会" },
        {
          p: [
            "以 Zcash 原生 ZEC **永久捐赠** 给 Zcash 基金会，发放方式与「Zcash 钱包」选项相同，之后无法更改。每笔捐赠都会在链上记录并对应到该代币；若基金会地址为屏蔽/统一地址，每次转账还会附带 [印章](/docs#stamps)，与链上记录相互关联。",
          ],
        },
        {
          note:
            "**在基金会捐赠地址被写入链上并经过核实之前，此选项保持关闭。** 春笋绝不会猜测或硬编码该地址。春笋与 Zcash 基金会没有任何关联，也未获其背书。",
        },
      ],
    },
    {
      id: "grove",
      heading: "竹林",
      blocks: [
        {
          p: [
            "竹林是一个共享的、协议自有的 PancakeSwap V2 **$SPROUT/ZEC** 流动性池。每枚春笋代币 0.50% 的流动性分成都汇入其中。",
            "每次注入流动性时，守护程序从奖池取出 BNB，一半兑换成 ZEC（PancakeSwap V3），一半兑换成 $SPROUT（Flap），一起添加为流动性，并把 LP 代币发送到销毁地址 `0x…dEaD`。整个过程在一笔原子交易中完成。",
          ],
        },
        {
          ul: [
            "每次最多提取 **0.5 BNB**。",
            "两次之间至少间隔 **300 秒**。",
            "LP 已销毁，任何人（包括春笋）都无法撤出。",
          ],
        },
        { note: "竹林加深的是 $SPROUT/ZEC 的流动性，**不为任何单一代币背书**，也不保证你发射或买入的任何代币有流动性。" },
      ],
    },
    {
      id: "rootstock",
      heading: "竹根：回购销毁",
      blocks: [
        { p: ["竹根在 Flap 上买入 $SPROUT 并发送到 `0x…dEaD`（回购销毁），资金来自三个来源："] },
        {
          ul: [
            "每枚春笋代币税费中 **0.50%** 的竹根分成。",
            "Flap 对春笋代币支付的 **集成方佣金**（春笋合约为佣金接收方）。",
            "每笔 [终端](/terminal) 交易中 **0.25%** 的竹根分成。",
          ],
        },
        { p: ["同样的限制适用：每次销毁最多 0.5 BNB，两次之间至少 300 秒，每次兑换都有最低输出检查。"] },
      ],
    },
    {
      id: "zec-bridge",
      heading: "ZEC 在春笋与 Zcash 之间流转",
      blocks: [
        {
          p: [
            "原生 ZEC 通过 **NEAR Intents 1Click** 在 Zcash 与 BNB 链之间流转：1Click 把 Zcash 上的 ZEC 兑换为 BNB 链上的 BNB，反之亦然。（1Click 不支持 BEP-20 ZEC，所以每次跨链在 BNB 链一侧都是 BNB。）",
          ],
        },
        { h: "充入 ZEC" },
        {
          ul: [
            "春笋请求报价后，会显示一个 **一次性充值地址**、**精确金额**、**截止时间** 和二维码。",
            "从你的 Zcash 钱包按该金额准确转账一次。切勿重复使用充值地址。",
            "通常约 10 分钟完成。BNB 到账你的 Sprout 账户，并按实时汇率以 ZEC 显示。",
            "如果金额不足、超时或兑换无法完成，截止时间（约 **80 分钟**）过后开始退款。退款退回 **你的透明地址**，并扣除少量 1Click 退款手续费。",
          ],
        },
        { h: "提现到 Zcash" },
        {
          p: [
            "卖出时选择 **以 Zcash 原生 ZEC 接收**。卖出和 1Click 充值在 **同一笔交易** 中完成 —— 交易失败则不会发出任何资金。资金到账你的透明地址。",
          ],
        },
        { h: "隐私提现" },
        {
          p: [
            "1Click **只能发送到 Zcash 透明地址**。若要接收到屏蔽地址或统一地址，1Click 会先把 ZEC 发给春笋的 **屏蔽转发器**（由春笋运行的 Zcash 钱包），再由它转发到你的屏蔽地址，并在备注中附上 [印章](/docs#stamps)。",
          ],
        },
        {
          ul: [
            "限额：**每笔最多 100 ZEC**；全平台 **每天最多 1,000 ZEC、2,000 笔**。",
            "转发器只持有你的 ZEC **几分钟**，但在此期间资金由春笋托管，你需要信任春笋完成转发。",
          ],
        },
        {
          note:
            "在春笋获得 1Click 合作方密钥之前，请求均为未认证请求，1Click 每笔兑换额外收取 **0.25%** 费用（获得密钥后改按 1Click 合作方费率计算）。每次报价都会在你转账前显示实际到账金额。",
        },
      ],
    },
    {
      id: "stamps",
      heading: "印章",
      blocks: [
        {
          p: [
            "印章是写在屏蔽转账加密备注中的收据：`sprout-stamp:v1:<payoutId>:<bsc tx hash>`。它把你收到的 ZEC 与 BNB 链上对应的公开交易关联起来，让你能证明款项来源，而不泄露其他信息。",
            "只有能解密你屏蔽交易的人才能读取印章。",
          ],
        },
        {
          note: "若要让他人核验你的印章，你需要分享 **查看密钥**。查看密钥会暴露该地址收到的 **所有** 款项，而不仅是来自春笋的。只与你完全信任的人分享。",
        },
      ],
    },
    {
      id: "terminal",
      heading: "交易终端",
      blocks: [
        {
          p: [
            "[交易终端](/terminal) 可交易 **任意 Flap 代币**，不限于春笋代币。每笔交易按 BNB 一侧收取 **1%**：**0.25%** 进入竹根，**0.75%** 归春笋。终端卖出也可在同一笔交易中提现到 Zcash。",
            "春笋代币本身在其代币页面直接通过 Flap 交易，不收终端费。",
          ],
        },
        {
          ul: [
            "内置防护会拒绝 Flap 标记为无效的代币，以及买入或卖出税费高于 **5%** 的代币。",
            "通过防护检查只说明它通过了这项检查。春笋 **从不声称任何代币是安全的**。",
          ],
        },
      ],
    },
    {
      id: "nodes",
      heading: "竹节：公开账本",
      blocks: [
        {
          p: [
            "[竹节](/nodes) 是一本完全由链上事件构成的公开账本：代币种下、金库结算、向收款人和持币者发放的 ZEC、跨链到 Zcash 的转账（含 1Click 充值地址和报价编号）、竹林注入和竹根销毁。每一行都链接到对应交易，任何人都可以核查。",
            "汇总数据见 [数据](/stats)。这些页面上的一切都读取自 BNB 链 —— 绝不展示示例数据。",
          ],
        },
      ],
    },
    {
      id: "sprout-token",
      heading: "$SPROUT",
      blocks: [
        {
          p: [
            "$SPROUT 是平台代币。竹根回购并销毁它，竹林将它与 ZEC 配对。",
            "**$SPROUT 的官方合约地址只在本站公布，** 且须先在春笋的 Roots 合约中设定（仅可设定一次）。任何未在本站列出、却自称 $SPROUT 的代币都应视为假币。",
          ],
        },
        { note: "本页内容不构成对价格、收益或任何本页未描述用途的承诺。" },
      ],
    },
    {
      id: "keys",
      heading: "密钥与控制权",
      blocks: [
        { p: ["春笋并非完全去信任。以下是现有的角色，以及各自能做和不能做的事："] },
        {
          table: {
            head: ["角色", "可以", "不能"],
            rows: [
              [
                "**管理员**",
                "更改运营收款地址；把管理员权限移交给新地址；在 Roots 中设定 $SPROUT（仅一次）；设定 Zcash 基金会地址（仅一次）；更换守护程序。",
                "升级金库代码、修改任何代币的税费或分配比例、把金库奖池转往别处、操作你的账户。",
              ],
              [
                "**守护程序**（自动化服务）",
                "触发金库结算；执行竹林注入和竹根销毁（每次 ≤ 0.5 BNB，间隔 ≥ 300 秒）；把收款人奖池兑换为 ZEC（带最低输出检查）；跨链发出 Zcash 分成（每次 ≤ 1 BNB）；在启用备用分发时发布持币分红快照。",
                "把「我自己」或「其他钱包」的分成付给收款人以外的任何人；把 BNB 或 ZEC 提取给自己；跳过最低输出检查。",
              ],
              [
                "**中继器**",
                "提交由你的通行密钥签名的交易，并领取签名中约定的 Gas 报销。",
                "篡改你签名的内容（调用、截止时间、Gas 费和费用接收方都包含在签名中）。它可以延迟或拒绝中继。",
              ],
              [
                "**转发器**",
                "在转发隐私提现时持有 ZEC 几分钟。",
                "超出隐私提现限额。持有期间属于托管状态。",
              ],
              [
                "**Flap Guardian**",
                "通过信标升级所有春笋金库；充当守护程序；在紧急情况下更改收款人。",
                "—",
              ],
            ],
          },
        },
        { h: "Zcash 发放：需要信任的环节" },
        {
          p: [
            "对于「Zcash 钱包」和「Zcash 基金会」两种选项，守护程序会请求 1Click 报价，并把 BNB 发送到 **报价返回的充值地址**。合约无法在链上验证该充值地址确实属于发往正确收款人的 1Click 报价 —— 因此这一环节需要信任守护程序。",
            "为了让它可以被核查，每次跨链都会在链上记录（`BridgedOut` 事件），包括金库、金额、充值地址、报价编号和目标 Zcash 地址。任何人都可以通过 1Click 的公开状态接口（`/v0/status`）查询该充值地址，确认资金送达何处。每次调用上限为 1 BNB，全部记录都可在 [竹节](/nodes) 查看。",
            "另一个需要信任的环节是持币分红的备用方案：快照由守护程序在链下计算，链上只发布其根哈希。每位持币者的领取额度和证明都可以对照该根哈希核验，但链上无法检验快照本身是否正确。",
          ],
        },
      ],
    },
    {
      id: "flap-fees",
      heading: "Flap 费用",
      blocks: [
        { p: ["春笋代币就是 Flap 代币，所以除代币税费外，还适用 Flap 自身的协议费用："] },
        {
          ul: [
            "BNB 链内盘交易收取 **1%**。",
            "税费代币协议费率 **最高为交易额的 0.3%**，在税费进入金库前扣除。",
            "毕业后，外盘交易适用 PancakeSwap 的池子手续费。",
          ],
        },
        { p: ["春笋不收发射费，唯一收入是 0.20% 的运营分成和 0.75% 的终端分成。"] },
      ],
    },
    {
      id: "risks",
      heading: "风险",
      blocks: [
        {
          ul: [
            "大多数迷因币最终归零。只投入你能承受损失的资金。",
            "春笋合约 **未经审计**。",
            "跨链依赖 NEAR Intents；BEP-20 ZEC 依赖币安的托管。",
            "丢失通行密钥 = 丢失 Sprout 账户。",
            "退款退回透明地址，BNB 链上的一切都是公开的。",
          ],
        },
        { p: ["使用前请阅读完整的 [风险披露](/risk)。"] },
      ],
    },
  ],
  faq: [
    { q: "必须有 ZEC 吗？", a: "不需要。ZEC 是主要入口，但 BNB 钱包同样可以使用全部功能 —— 发射、交易和交易终端。" },
    {
      q: "需要 BNB 支付 Gas 吗？",
      a: "使用 Sprout 账户时不需要。中继器代付 Gas，并在同一笔交易中从你的账户余额报销，不加价。使用 BNB 钱包时由你自己支付 Gas。",
    },
    {
      q: "跨链过来的 ZEC 是隐私的吗？",
      a: "不是。1Click 在 Zcash 一侧使用透明地址，BNB、BEP-20 ZEC 以及 BNB 链上的一切都是公开的。只有春笋转发器最后一段的屏蔽转账是隐私的。",
    },
    {
      q: "支持哪些 Zcash 钱包？",
      a: "任何能向透明地址转账的 Zcash 钱包都可以。退款需要你自己的透明地址；隐私提现需要带屏蔽地址或统一地址的钱包。春笋没有任何钱包合作方。",
    },
    {
      q: "运营方能拿走我的币吗？",
      a: "春笋无法替你的 Sprout 账户签名 —— 只有你的通行密钥可以 —— 也无法修改代币税费，或把收款人改到它指定的 BNB 地址。在 Zcash 发放环节（守护程序选择 1Click 充值地址，并记录在链上）、启用备用分发时的持币分红快照，以及转发器短暂持有隐私提现期间，你需要信任春笋。Flap Guardian 可以升级金库代码。详见 [密钥与控制权](/docs#keys)。",
    },
    {
      q: "毕业时会发生什么？",
      a: "总供应量的 80% 在内盘售出后，Flap 会把代币迁移到 PancakeSwap V2 外盘。毕业后 2% 税费和金库继续运作。",
    },
    { q: "税费会变吗？", a: "不会。买入 2%、卖出 2% 在发射时写入代币，税费期限约为 100 年。" },
    {
      q: "丢了通行密钥怎么办？",
      a: "你的 Sprout 账户将无法找回。请使用可同步的通行密钥，承受不起损失的资金请存放在你自己掌控的钱包中。",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* ABOUT                                                               */
/* ------------------------------------------------------------------ */

const aboutEn: PageDoc = {
  title: "About Sprout",
  lead:
    "Every market. One Zcash wallet. Now on BNB Chain. Sprout is the first Zcash-native launchpad and terminal on BNB Chain — launch, trade, cash out, in ZEC.",
  sections: [
    {
      id: "what",
      heading: "What Sprout is",
      blocks: [
        {
          p: [
            "Sprout lets Zcash holders use BNB Chain's memecoin markets without giving up their Zcash wallet. You fund from Zcash, see every price and balance in ZEC, earn rewards and payouts in ZEC, and cash out back to Zcash — optionally to a shielded address.",
            "Every Sprout coin is a real **Flap** tax token on BNB Chain. Part of every trade deepens one shared **$SPROUT/ZEC** pool, part buys and burns $SPROUT, and the deployer can send their share to holders, to a Zcash wallet or as a donation to the Zcash Foundation.",
          ],
        },
      ],
    },
    {
      id: "name",
      heading: "Why 春笋",
      blocks: [
        {
          p: [
            "春笋 means spring bamboo shoots. The saying 雨后春笋 — “like bamboo shoots after rain” — describes things springing up everywhere at once. That is what a launchpad should feel like: plant a coin, grow the grove.",
            "The names follow the plant. A new coin is a **Seed** (笋芽), a trading coin is a **Shoot** (春笋), and a graduated coin joins the **Grove** (竹林). The shared pool is the Grove, the buy-and-burn is the **Rootstock** (竹根), the public ledger is **Nodes** (竹节), and receipts are **Stamps** (印章).",
          ],
        },
      ],
    },
    {
      id: "how",
      heading: "How it works",
      blocks: [
        {
          ul: [
            "**1. Bring ZEC in.** Create a passkey Sprout Account and send ZEC from your Zcash wallet to a one-time deposit address. NEAR Intents 1Click converts it to BNB in your account. (Or connect a BNB wallet.)",
            "**2. Plant or trade.** Launch a coin in one transaction, trade Sprout coins on Flap, or trade any Flap token on the Terminal. Your passkey signs; the relayer pays gas and is reimbursed from your balance.",
            "**3. Grow.** Every trade pays a fixed 2% tax: the Grove, Rootstock, operations, and the deployer's choice — paid in ZEC.",
            "**4. Cash out to Zcash.** Sell and receive native ZEC at your transparent address in the same transaction, or choose a shielded payout with a stamp in the memo.",
          ],
        },
        { p: ["Start on the [guide](/guide), or read the full [docs](/docs)."] },
      ],
    },
    {
      id: "fees",
      heading: "Fees at a glance",
      blocks: [
        {
          table: {
            head: ["Where", "Fee"],
            rows: [
              ["Sprout coin tax (buy and sell)", "2.00%: 0.50% Grove · 0.50% Rootstock · 0.20% Sprout · 0.80% deployer's choice"],
              ["Launch", "No Sprout fee — gas, your optional first buy, and any Flap creation fee"],
              ["Terminal (any Flap token)", "1%: 0.25% Rootstock · 0.75% Sprout"],
              ["Flap protocol", "1% on the bonding curve; up to 0.3% tax-token rate"],
              ["NEAR Intents 1Click", "1Click's swap fees; 0.25% per swap while Sprout has no partner key"],
            ],
          },
        },
      ],
    },
    {
      id: "status",
      heading: "Status and independence",
      blocks: [
        {
          p: [
            "Sprout's contracts are deployed on BNB Chain mainnet with sources verified on Sourcify. They are **not audited**. See the [roadmap](/roadmap) for what is done and what comes next.",
          ],
        },
        {
          note:
            "Sprout is independent. It is not affiliated with the Zcash Foundation, Electric Coin Co., Flap, Binance, BNB Chain, PancakeSwap or NEAR.",
        },
      ],
    },
  ],
};

const aboutZh: PageDoc = {
  title: "关于春笋",
  lead: "一个 Zcash 钱包，畅玩 BNB 链每一个市场。春笋是 BNB 链上首个 Zcash 原生的发射平台与交易终端 —— 发射、交易、提现，全程 ZEC。",
  sections: [
    {
      id: "what",
      heading: "春笋是什么",
      blocks: [
        {
          p: [
            "春笋让 Zcash 持有者无需离开自己的 Zcash 钱包，就能参与 BNB 链的迷因币市场。从 Zcash 充值，所有价格和余额以 ZEC 显示，奖励和分成以 ZEC 发放，最后提现回 Zcash —— 也可以提现到屏蔽地址。",
            "每一枚春笋代币都是 BNB 链上真正的 **Flap** 税费代币。每笔交易的一部分汇入共享的 **$SPROUT/ZEC** 池，一部分回购销毁 $SPROUT；部署者可以把自己的分成留给持币者、发到 Zcash 钱包，或捐赠给 Zcash 基金会。",
          ],
        },
      ],
    },
    {
      id: "name",
      heading: "为什么叫春笋",
      blocks: [
        {
          p: [
            "春笋即春天的竹笋。「雨后春笋」形容新事物蓬勃涌现 —— 这正是发射平台该有的样子：种下一枚币，长成一片竹林。",
            "名称都取自竹子：新币是 **笋芽**，交易中的币是 **春笋**，毕业的币进入 **竹林**。共享流动性池叫竹林，回购销毁叫 **竹根**，公开账本叫 **竹节**，收据叫 **印章**。",
          ],
        },
      ],
    },
    {
      id: "how",
      heading: "运作方式",
      blocks: [
        {
          ul: [
            "**1. 充入 ZEC。** 创建一个通行密钥 Sprout 账户，从 Zcash 钱包向一次性充值地址转入 ZEC，NEAR Intents 1Click 会将其兑换为 BNB 存入你的账户。（也可以连接 BNB 钱包。）",
            "**2. 种币或交易。** 一笔交易即可发射代币；在 Flap 上交易春笋代币；或在交易终端交易任意 Flap 代币。通行密钥签名，中继器代付 Gas 并从你的余额中报销。",
            "**3. 生长。** 每笔交易缴纳固定 2% 税费：竹林、竹根、运营，以及部署者自选的去向 —— 以 ZEC 发放。",
            "**4. 提现到 Zcash。** 卖出后在同一笔交易中以原生 ZEC 提现到你的透明地址，或选择隐私提现，备注中附带印章。",
          ],
        },
        { p: ["从 [新手指南](/guide) 开始，或阅读完整 [文档](/docs)。"] },
      ],
    },
    {
      id: "fees",
      heading: "费用一览",
      blocks: [
        {
          table: {
            head: ["场景", "费用"],
            rows: [
              ["春笋代币税费（买入与卖出）", "2.00%：竹林 0.50% · 竹根 0.50% · 运营 0.20% · 部署者自选 0.80%"],
              ["发射", "春笋不收费 —— 只需 Gas、可选的首笔买入，以及 Flap 可能收取的创建费"],
              ["交易终端（任意 Flap 代币）", "1%：竹根 0.25% · 春笋 0.75%"],
              ["Flap 协议", "内盘 1%；税费代币费率最高 0.3%"],
              ["NEAR Intents 1Click", "1Click 兑换费用；春笋获得合作方密钥前每笔收取 0.25%"],
            ],
          },
        },
      ],
    },
    {
      id: "status",
      heading: "现状与独立性",
      blocks: [
        { p: ["春笋的合约已部署到 BNB 链主网，源码已在 Sourcify 验证，但 **未经审计**。已完成的事项与下一步计划见 [路线图](/roadmap)。"] },
        { note: "春笋是独立项目，与 Zcash 基金会、Electric Coin Co.、Flap、币安、BNB Chain、PancakeSwap 及 NEAR 均无关联。" },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* GUIDE                                                               */
/* ------------------------------------------------------------------ */

const guideEn: PageDoc = {
  title: "Start here",
  lead: "Two ways in. If you hold ZEC, start with your Zcash wallet. If you already use BNB Chain, connect a BNB wallet. Both get every feature.",
  sections: [
    {
      id: "paths",
      heading: "Choose your path",
      blocks: [
        {
          table: {
            head: ["", "Zcash wallet", "BNB wallet"],
            rows: [
              ["Account", "Passkey Sprout Account", "MetaMask, Binance Wallet, OKX Wallet, TokenPocket…"],
              ["Funding", "Send ZEC from Zcash", "BNB you already hold, or bridge on [Move ZEC](/zec)"],
              ["Gas", "Paid by the relayer, reimbursed from your balance", "You pay in BNB"],
              ["Cash out", "Native ZEC to your Zcash wallet, optionally shielded", "BNB, or bridge to Zcash"],
              ["Step-by-step", "[Zcash wallet guide](/guide/zcash)", "Below"],
            ],
          },
        },
      ],
    },
    {
      id: "zcash",
      heading: "With a Zcash wallet",
      blocks: [
        {
          ul: [
            "Have your **transparent address** (`t1…`/`t3…`) ready for refunds, and a **shielded or unified address** if you want shielded payouts.",
            "Go to [Account](/account), paste your addresses and create your passkey. Use a passkey that syncs — it is the only key, with no recovery.",
            "Choose an amount. Sprout shows a one-time deposit address, the exact ZEC amount and a deadline. Send exactly that, once.",
            "Wait about 10 minutes. Your balance appears in ZEC.",
          ],
        },
        { p: ["The [full Zcash wallet guide](/guide/zcash) walks through every screen."] },
      ],
    },
    {
      id: "bnb",
      heading: "With a BNB wallet",
      blocks: [
        {
          ul: [
            "Connect your wallet on BNB Chain (chain ID 56).",
            "Keep a little BNB for gas.",
            "To bring ZEC from Zcash or send ZEC back, use [Move ZEC](/zec).",
          ],
        },
      ],
    },
    {
      id: "next",
      heading: "Then",
      blocks: [
        {
          ul: [
            "**Plant a coin** on [Launch](/launch): name, ticker, image, and where the deployer's 0.80% goes.",
            "**Trade** Sprout coins from their coin pages, or any Flap token on the [Terminal](/terminal).",
            "**Cash out** by selling with “Receive as native ZEC on Zcash”.",
            "**Check everything** on [Nodes](/nodes) and [Stats](/stats).",
          ],
        },
      ],
    },
    {
      id: "safety",
      heading: "Before you start",
      blocks: [
        {
          ul: [
            "Most memecoins go to zero. Use only what you can afford to lose.",
            "Sprout's contracts are not audited.",
            "Never send to a deposit address twice, and never after its deadline.",
            "Sprout staff will never ask for your passkey, seed phrase or viewing key.",
          ],
        },
        { p: ["Read the [risks](/risk) and the [docs](/docs)."] },
      ],
    },
  ],
};

const guideZh: PageDoc = {
  title: "从这里开始",
  lead: "两种入口：持有 ZEC，就用 Zcash 钱包开始；已经在用 BNB 链，就连接 BNB 钱包。两种方式都能使用全部功能。",
  sections: [
    {
      id: "paths",
      heading: "选择你的入口",
      blocks: [
        {
          table: {
            head: ["", "Zcash 钱包", "BNB 钱包"],
            rows: [
              ["账户", "通行密钥 Sprout 账户", "MetaMask、币安钱包、OKX 钱包、TokenPocket 等"],
              ["充值", "从 Zcash 转入 ZEC", "使用已有 BNB，或在 [Move ZEC](/zec) 跨链"],
              ["Gas", "中继器代付，从你的余额中报销", "自己用 BNB 支付"],
              ["提现", "原生 ZEC 到你的 Zcash 钱包，可选隐私提现", "BNB，或跨链到 Zcash"],
              ["详细步骤", "[Zcash 钱包指南](/guide/zcash)", "见下文"],
            ],
          },
        },
      ],
    },
    {
      id: "zcash",
      heading: "使用 Zcash 钱包",
      blocks: [
        {
          ul: [
            "准备好你的 **透明地址**（`t1…`/`t3…`）用于退款；如需隐私提现，再准备一个 **屏蔽地址或统一地址**。",
            "前往 [账户](/account)，粘贴地址并创建通行密钥。请使用可同步的通行密钥 —— 它是唯一的钥匙，无法找回。",
            "选择金额。春笋会显示一次性充值地址、精确的 ZEC 金额和截止时间。按该金额准确转账一次。",
            "等待约 10 分钟，余额会以 ZEC 显示。",
          ],
        },
        { p: ["[完整的 Zcash 钱包指南](/guide/zcash) 会逐个页面讲解。"] },
      ],
    },
    {
      id: "bnb",
      heading: "使用 BNB 钱包",
      blocks: [
        {
          ul: [
            "在 BNB 链（Chain ID 56）上连接钱包。",
            "保留少量 BNB 作为 Gas。",
            "从 Zcash 转入 ZEC 或把 ZEC 转回 Zcash，请使用 [Move ZEC](/zec)。",
          ],
        },
      ],
    },
    {
      id: "next",
      heading: "接下来",
      blocks: [
        {
          ul: [
            "**种下一枚币**：在 [发射](/launch) 页面填写名称、代币符号、图片，并选择部署者 0.80% 分成的去向。",
            "**交易**：在代币页面交易春笋代币，或在 [交易终端](/terminal) 交易任意 Flap 代币。",
            "**提现**：卖出时选择「以 Zcash 原生 ZEC 接收」。",
            "**核查一切**：查看 [竹节](/nodes) 和 [数据](/stats)。",
          ],
        },
      ],
    },
    {
      id: "safety",
      heading: "开始之前",
      blocks: [
        {
          ul: [
            "大多数迷因币最终归零，只投入你能承受损失的资金。",
            "春笋合约未经审计。",
            "同一个充值地址不要转账两次，也不要在截止时间后转账。",
            "春笋团队绝不会索要你的通行密钥、助记词或查看密钥。",
          ],
        },
        { p: ["请阅读 [风险](/risk) 和 [文档](/docs)。"] },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* ROADMAP                                                             */
/* ------------------------------------------------------------------ */

const roadmapEn: PageDoc = {
  title: "Roadmap",
  lead: "Where Sprout actually is. Nothing below is marked done unless it is done.",
  sections: [
    {
      id: "now",
      heading: "Now: live on BNB Chain",
      blocks: [
        {
          ul: [
            "**Deployed:** core contracts (vault factory, vaults, payouts, Roots, Terminal) and the passkey account factory are on BNB Chain mainnet, with sources verified on Sourcify.",
            "**Running:** this site, the keeper and the relayer.",
            "**Not audited:** no audit of Sprout's contracts has taken place.",
          ],
        },
      ],
    },
    {
      id: "launch",
      heading: "Next: $SPROUT and the Grove",
      blocks: [
        {
          ul: [
            "Launch **$SPROUT** and set it in Roots (a one-time setting).",
            "First Grove liquidity runs create the $SPROUT/ZEC pool; first Rootstock burns.",
            "Bring the shield forwarder online, and publish the status of every service.",
          ],
        },
      ],
    },
    {
      id: "trust",
      heading: "Then: trust and cost",
      blocks: [
        {
          ul: [
            "**Flap partner audit** of Sprout's vault factory, needed for Flap's low-risk badge (0.5 BNB per factory, per Flap's docs).",
            "**Zcash Foundation address:** set and verify the Foundation's donation address, then enable the Zcash Foundation option.",
            "**1Click partner key:** replaces the 0.25% unauthenticated fee with 1Click's partner rate.",
            "**Holder rewards:** test Flap's dividend deposit against a live Flap token; the snapshot fallback covers coins where it does not work.",
          ],
        },
      ],
    },
    {
      id: "later",
      heading: "Later",
      blocks: [
        {
          ul: [
            "Optional native-ZEC delivery for “Me” and “Another wallet” payees.",
            "Independent audit of the passkey account contracts.",
            "Better tooling for checking bridges and stamps.",
          ],
        },
        { note: "Plans can change. Dates are not promised." },
      ],
    },
  ],
};

const roadmapZh: PageDoc = {
  title: "路线图",
  lead: "春笋的真实进度。以下事项未完成的，一律不标记为完成。",
  sections: [
    {
      id: "now",
      heading: "现在：已在 BNB 链运行",
      blocks: [
        {
          ul: [
            "**已部署：** 核心合约（金库工厂、金库、分成发放、Roots、交易终端）与通行密钥账户工厂已在 BNB 链主网上线，源码已在 Sourcify 验证。",
            "**运行中：** 本网站、守护程序与中继器。",
            "**未审计：** 春笋合约尚未进行任何审计。",
          ],
        },
      ],
    },
    {
      id: "launch",
      heading: "下一步：$SPROUT 与竹林",
      blocks: [
        {
          ul: [
            "发行 **$SPROUT**，并在 Roots 中设定（仅可设定一次）。",
            "首次竹林注入建立 $SPROUT/ZEC 池；首次竹根销毁。",
            "屏蔽转发器上线，并公开每项服务的运行状态。",
          ],
        },
      ],
    },
    {
      id: "trust",
      heading: "然后：信任与成本",
      blocks: [
        {
          ul: [
            "**Flap 合作审计**：审计春笋的金库工厂，以获得 Flap 的低风险标识（根据 Flap 文档，每个工厂 0.5 BNB）。",
            "**Zcash 基金会地址**：设定并核实基金会的捐赠地址，然后开启「Zcash 基金会」选项。",
            "**1Click 合作方密钥**：以 1Click 合作方费率取代未认证请求的 0.25% 费用。",
            "**持币分红**：在真实的 Flap 代币上测试分红存入接口；无法使用的代币由快照备用方案兜底。",
          ],
        },
      ],
    },
    {
      id: "later",
      heading: "之后",
      blocks: [
        {
          ul: [
            "为「我自己」和「其他钱包」收款人提供可选的原生 ZEC 发放。",
            "对通行密钥账户合约进行独立审计。",
            "更好用的跨链与印章核查工具。",
          ],
        },
        { note: "计划可能调整，不承诺具体日期。" },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* RISK                                                                */
/* ------------------------------------------------------------------ */

const riskEn: PageDoc = {
  title: "Risks",
  lead: "Read this before you use Sprout. You can lose everything you put in.",
  sections: [
    {
      id: "memecoins",
      heading: "Memecoins",
      blocks: [
        {
          p: [
            "Most coins launched anywhere, including on Sprout, lose most or all of their value. Prices can collapse in seconds. Anyone can launch a coin with any name or image; a coin on Sprout is not endorsed, checked or vetted by Sprout.",
            "Holder rewards, payouts and burns do not make a coin worth anything. Past activity on [Nodes](/nodes) or [Stats](/stats) says nothing about the future.",
          ],
        },
      ],
    },
    {
      id: "liquidity",
      heading: "Shared liquidity backs no coin",
      blocks: [
        {
          p: [
            "The Grove is one $SPROUT/ZEC pool. It is not liquidity for your coin and does not protect anyone from losses. A coin's own liquidity is only what Flap's curve and, after graduation, its PancakeSwap pool hold.",
          ],
        },
      ],
    },
    {
      id: "contracts",
      heading: "Smart contracts",
      blocks: [
        {
          ul: [
            "Sprout's contracts are **unaudited**. They may contain bugs that lose funds.",
            "Sprout coins depend on Flap's contracts. Flap's Guardian can upgrade all Sprout vaults through their beacon.",
            "Passkey accounts rely on BNB Chain's P-256 signature precompile and on your device's passkey implementation.",
          ],
        },
      ],
    },
    {
      id: "bridges",
      heading: "Bridges and pegged ZEC",
      blocks: [
        {
          ul: [
            "Moving ZEC between Zcash and BNB Chain relies on **NEAR Intents 1Click** and the parties behind it. It can be slow, unavailable, mispriced or fail.",
            "**BEP-20 ZEC** (Binance-Peg ZEC) used for payouts and the Grove is a token backed by Binance's custody, not native ZEC. If that peg fails, it can lose its value.",
            "Deposits sent short, late, twice or to an expired address may be refunded with fees deducted, or lost.",
          ],
        },
      ],
    },
    {
      id: "passkey",
      heading: "Passkey loss",
      blocks: [
        {
          p: [
            "Your passkey is the only key to your Sprout Account. If you lose it — a lost phone without sync, a deleted credential, a wiped security key — the account and its funds are gone permanently. Sprout cannot recover it.",
          ],
        },
      ],
    },
    {
      id: "operators",
      heading: "Services and trust",
      blocks: [
        {
          ul: [
            "The **relayer** can go down; you then cannot use your Sprout Account until it is back (your funds stay in the account).",
            "The **keeper** can go down, delaying payouts, rewards, burns and liquidity runs. For Zcash payouts it chooses the 1Click deposit address; a faulty or compromised keeper could misdirect those pots (each bridge call is capped at 1 BNB, but calls can repeat). Every bridge is logged on-chain so this can be detected. It also computes holder-reward snapshots when the fallback distributor is used.",
            "The **shield forwarder** holds ZEC for minutes while forwarding. During that window your ZEC is in Sprout's custody; downtime delays shielded payouts.",
          ],
        },
      ],
    },
    {
      id: "privacy",
      heading: "Privacy",
      blocks: [
        {
          ul: [
            "Everything on BNB Chain is public, including your Sprout Account's activity.",
            "Bridged ZEC is not private: 1Click uses transparent Zcash addresses, and refunds go to your transparent address.",
            "Only the final shielded payout leg is private. Sharing a viewing key reveals all payments to that address.",
          ],
        },
      ],
    },
    {
      id: "tax-tokens",
      heading: "Tax tokens",
      blocks: [
        {
          p: [
            "Every Sprout coin charges 2% on each buy and sell, plus Flap and DEX fees. Frequent trading costs more than it seems. Tokens on the Terminal may have other taxes up to 5%, and other mechanics Sprout does not check.",
          ],
        },
      ],
    },
    {
      id: "legal",
      heading: "Regulation and advice",
      blocks: [
        {
          ul: [
            "Crypto assets may be restricted or illegal where you live. You are responsible for complying with your local laws and taxes.",
            "Rules can change and may affect Sprout, Flap, NEAR Intents or Binance-Peg assets.",
            "Nothing on Sprout is financial, investment, legal or tax advice.",
          ],
        },
        { p: ["See also the [terms](/terms)."] },
      ],
    },
  ],
};

const riskZh: PageDoc = {
  title: "风险",
  lead: "使用春笋前请仔细阅读。你可能损失投入的全部资金。",
  sections: [
    {
      id: "memecoins",
      heading: "迷因币",
      blocks: [
        {
          p: [
            "无论在哪个平台发射，包括在春笋上，大多数代币都会损失大部分甚至全部价值，价格可能在几秒内崩盘。任何人都能用任意名称或图片发射代币；春笋上的代币未经春笋背书、检查或审核。",
            "持币分红、发放和销毁都不能让一枚代币变得有价值。[竹节](/nodes) 或 [数据](/stats) 上的历史记录不代表未来。",
          ],
        },
      ],
    },
    {
      id: "liquidity",
      heading: "共享流动性不为任何代币背书",
      blocks: [
        {
          p: [
            "竹林是一个 $SPROUT/ZEC 池，不是你代币的流动性，也不能保护任何人免受损失。一枚代币自身的流动性，只有 Flap 内盘以及毕业后 PancakeSwap 外盘池子里的部分。",
          ],
        },
      ],
    },
    {
      id: "contracts",
      heading: "智能合约",
      blocks: [
        {
          ul: [
            "春笋合约 **未经审计**，可能存在导致资金损失的漏洞。",
            "春笋代币依赖 Flap 的合约。Flap Guardian 可以通过信标升级所有春笋金库。",
            "通行密钥账户依赖 BNB 链的 P-256 签名预编译合约，以及你设备上的通行密钥实现。",
          ],
        },
      ],
    },
    {
      id: "bridges",
      heading: "跨链与锚定 ZEC",
      blocks: [
        {
          ul: [
            "ZEC 在 Zcash 与 BNB 链之间的流转依赖 **NEAR Intents 1Click** 及其背后的参与方，可能缓慢、不可用、报价偏差或失败。",
            "用于发放和竹林的 **BEP-20 ZEC**（Binance-Peg ZEC）是由币安托管背书的代币，不是原生 ZEC。一旦锚定失效，它可能失去价值。",
            "金额不足、超时、重复转账或转入已过期地址的充值，可能在扣除费用后退款，也可能丢失。",
          ],
        },
      ],
    },
    {
      id: "passkey",
      heading: "丢失通行密钥",
      blocks: [
        {
          p: [
            "通行密钥是你 Sprout 账户的唯一钥匙。一旦丢失 —— 未开启同步的手机丢失、凭据被删除、安全密钥被重置 —— 账户及其资金将永久丢失，春笋无法帮你找回。",
          ],
        },
      ],
    },
    {
      id: "operators",
      heading: "后台服务与信任",
      blocks: [
        {
          ul: [
            "**中继器** 可能宕机，期间你无法使用 Sprout 账户，直到其恢复（资金仍在账户中）。",
            "**守护程序** 可能宕机，导致分成、分红、销毁和流动性注入延迟。在 Zcash 发放中由它选择 1Click 充值地址；出错或被攻破的守护程序可能把这些奖池发错地方（每次跨链调用上限 1 BNB，但可以多次调用）。每次跨链都记录在链上，可以被发现。启用备用分发时，持币分红快照也由它计算。",
            "**屏蔽转发器** 在转发时会持有 ZEC 几分钟，期间你的 ZEC 由春笋托管；其宕机会延迟隐私提现。",
          ],
        },
      ],
    },
    {
      id: "privacy",
      heading: "隐私",
      blocks: [
        {
          ul: [
            "BNB 链上的一切都是公开的，包括你 Sprout 账户的所有活动。",
            "跨链的 ZEC 不具隐私性：1Click 使用 Zcash 透明地址，退款也会退回你的透明地址。",
            "只有最后一段屏蔽转账是隐私的。分享查看密钥会暴露该地址收到的全部款项。",
          ],
        },
      ],
    },
    {
      id: "tax-tokens",
      heading: "税费代币",
      blocks: [
        {
          p: [
            "每枚春笋代币的每笔买入和卖出都收取 2% 税费，另加 Flap 和 DEX 手续费，频繁交易的成本比看起来更高。交易终端上的代币可能有其他税费（最高 5%）及春笋不会检查的其他机制。",
          ],
        },
      ],
    },
    {
      id: "legal",
      heading: "监管与建议",
      blocks: [
        {
          ul: [
            "加密资产在你所在的地区可能受到限制或属于违法。遵守当地法律和税务规定是你自己的责任。",
            "相关规则可能变化，并可能影响春笋、Flap、NEAR Intents 或 Binance-Peg 资产。",
            "春笋上的任何内容都不构成金融、投资、法律或税务建议。",
          ],
        },
        { p: ["另见 [服务条款](/terms)。"] },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* TERMS                                                               */
/* ------------------------------------------------------------------ */

const termsEn: PageDoc = {
  title: "Terms of use",
  lead: "By using Sprout you agree to these terms. If you do not agree, do not use Sprout.",
  sections: [
    {
      id: "service",
      heading: "What Sprout is",
      blocks: [
        {
          p: [
            "Sprout is an interface and a set of smart contracts and services that let you launch and trade tokens on BNB Chain through Flap, and move value to and from Zcash through NEAR Intents 1Click. Sprout does not issue, sell or endorse the coins launched with it.",
          ],
        },
      ],
    },
    {
      id: "eligibility",
      heading: "Eligibility",
      blocks: [
        {
          ul: [
            "You must be of legal age to enter into these terms where you live.",
            "You may not use Sprout if you are subject to sanctions, or if using it is unlawful where you are.",
            "You are responsible for your own taxes and legal compliance.",
          ],
        },
      ],
    },
    {
      id: "self-custody",
      heading: "Your keys, your responsibility",
      blocks: [
        {
          p: [
            "Your Sprout Account is controlled by your passkey alone; a connected BNB wallet is controlled by you alone. Sprout cannot reverse transactions, recover passkeys or restore lost funds.",
          ],
        },
      ],
    },
    {
      id: "custody",
      heading: "Limited custody",
      blocks: [
        {
          p: [
            "When you choose a shielded payout, Sprout's forwarder briefly holds your ZEC to forward it, within the published limits. Payout pots for Zcash destinations are bridged by Sprout's keeper. Apart from these, Sprout does not hold user funds.",
          ],
        },
      ],
    },
    {
      id: "third-parties",
      heading: "Third parties",
      blocks: [
        {
          p: [
            "Sprout relies on Flap, PancakeSwap, NEAR Intents 1Click, Binance-Peg ZEC, BNB Chain, the Zcash network and public RPC providers. Their fees, terms and failures are outside Sprout's control. Sprout is not affiliated with any of them, nor with the Zcash Foundation or Electric Coin Co.",
          ],
        },
      ],
    },
    {
      id: "conduct",
      heading: "Acceptable use",
      blocks: [
        {
          ul: [
            "Do not launch coins that impersonate real people, projects or organisations, infringe others' rights, or are designed to defraud.",
            "Do not use Sprout for money laundering, sanctions evasion or other unlawful activity.",
            "Do not attack, overload or interfere with Sprout's contracts, relayer, keeper, forwarder or site.",
          ],
        },
        {
          p: [
            "Sprout may hide coins or content from its site and may refuse to relay or forward for addresses involved in abuse. It cannot remove anything from the blockchain.",
          ],
        },
      ],
    },
    {
      id: "fees",
      heading: "Fees",
      blocks: [
        { p: ["Fees are described in the [docs](/docs). Coin tax rates are fixed at launch; Terminal and service fees may change for future transactions."] },
      ],
    },
    {
      id: "no-warranty",
      heading: "No warranty, no advice",
      blocks: [
        {
          p: [
            "Sprout is provided “as is” and “as available”, without warranties of any kind. Its contracts are unaudited. Nothing on Sprout is financial, investment, legal or tax advice. Read the [risks](/risk).",
          ],
        },
      ],
    },
    {
      id: "liability",
      heading: "Limitation of liability",
      blocks: [
        {
          p: [
            "To the maximum extent permitted by law, Sprout's contributors are not liable for any loss arising from your use of Sprout, including loss of funds, lost passkeys, bridge or peg failures, smart-contract bugs, service downtime or the conduct of other users.",
          ],
        },
      ],
    },
    {
      id: "changes",
      heading: "Changes",
      blocks: [
        {
          p: [
            "These terms may be updated. Continued use after an update means you accept it. If the English and Chinese versions differ, the English version prevails.",
          ],
        },
      ],
    },
  ],
};

const termsZh: PageDoc = {
  title: "服务条款",
  lead: "使用春笋即表示你同意以下条款。如不同意，请勿使用。",
  sections: [
    {
      id: "service",
      heading: "春笋是什么",
      blocks: [
        {
          p: [
            "春笋是一个界面，以及一组智能合约和后台服务：让你通过 Flap 在 BNB 链上发射和交易代币，并通过 NEAR Intents 1Click 在 Zcash 之间转移价值。春笋不发行、不出售、也不背书任何通过它发射的代币。",
          ],
        },
      ],
    },
    {
      id: "eligibility",
      heading: "使用资格",
      blocks: [
        {
          ul: [
            "你必须在所在地达到可订立本条款的法定年龄。",
            "如果你受到制裁，或在你所在地使用春笋属于违法，则不得使用。",
            "你需自行负责纳税及法律合规。",
          ],
        },
      ],
    },
    {
      id: "self-custody",
      heading: "你的密钥，你负责",
      blocks: [
        {
          p: [
            "你的 Sprout 账户只由你的通行密钥控制；连接的 BNB 钱包只由你本人控制。春笋无法撤销交易、找回通行密钥或恢复丢失的资金。",
          ],
        },
      ],
    },
    {
      id: "custody",
      heading: "有限托管",
      blocks: [
        {
          p: [
            "当你选择隐私提现时，春笋的转发器会在公布的限额内短暂持有你的 ZEC 并完成转发。发往 Zcash 的分成奖池由春笋的守护程序跨链发出。除此之外，春笋不持有用户资金。",
          ],
        },
      ],
    },
    {
      id: "third-parties",
      heading: "第三方",
      blocks: [
        {
          p: [
            "春笋依赖 Flap、PancakeSwap、NEAR Intents 1Click、Binance-Peg ZEC、BNB 链、Zcash 网络以及公共 RPC 服务。它们的费用、条款和故障不在春笋控制范围内。春笋与上述各方均无关联，与 Zcash 基金会和 Electric Coin Co. 也无关联。",
          ],
        },
      ],
    },
    {
      id: "conduct",
      heading: "使用规范",
      blocks: [
        {
          ul: [
            "不得发射冒充真实人物、项目或机构的代币，不得侵犯他人权利，不得以欺诈为目的发射代币。",
            "不得将春笋用于洗钱、规避制裁或其他违法活动。",
            "不得攻击、过载或干扰春笋的合约、中继器、守护程序、转发器或网站。",
          ],
        },
        { p: ["春笋可以在网站上隐藏代币或内容，并可拒绝为涉及滥用的地址中继或转发，但无法从区块链上删除任何内容。"] },
      ],
    },
    {
      id: "fees",
      heading: "费用",
      blocks: [{ p: ["费用说明见 [文档](/docs)。代币税率在发射时固定；交易终端及服务费用可能针对未来的交易进行调整。"] }],
    },
    {
      id: "no-warranty",
      heading: "无担保，不构成建议",
      blocks: [
        {
          p: [
            "春笋按「现状」和「现有」提供，不作任何形式的担保。其合约未经审计。春笋上的任何内容都不构成金融、投资、法律或税务建议。请阅读 [风险](/risk)。",
          ],
        },
      ],
    },
    {
      id: "liability",
      heading: "责任限制",
      blocks: [
        {
          p: [
            "在法律允许的最大范围内，春笋的贡献者不对你使用春笋产生的任何损失承担责任，包括资金损失、通行密钥丢失、跨链或锚定失效、智能合约漏洞、服务中断或其他用户的行为。",
          ],
        },
      ],
    },
    {
      id: "changes",
      heading: "条款变更",
      blocks: [{ p: ["本条款可能更新。更新后继续使用即表示你接受更新。如中英文版本不一致，以英文版本为准。"] }],
    },
  ],
};

export const pages: Record<PageKey, Record<Lang, PageDoc>> = {
  docs: { en: docsEn, zh: docsZh },
  about: { en: aboutEn, zh: aboutZh },
  guide: { en: guideEn, zh: guideZh },
  roadmap: { en: roadmapEn, zh: roadmapZh },
  risk: { en: riskEn, zh: riskZh },
  terms: { en: termsEn, zh: termsZh },
};
