---
layout: home

hero:
  name: "BlockBite"
  text: "Token Vesting & Milestone Rewards"
  tagline: "Trustless, automated token distributions on Solana. Replace manual transfers with on-chain schedules enforced by smart contracts — no oversight gaps, no exploits."
  image:
    src: /logo.png
    alt: BlockBite
  actions:
    - theme: brand
      text: Quick Start (5 min)
      link: /guide/quickstart
    - theme: alt
      text: Integration Guide
      link: /guide/integration
    - theme: alt
      text: View on Devnet →
      link: https://explorer.solana.com/address/Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq?cluster=devnet

features:
  - icon: ⏱️
    title: Cliff + Linear Vesting
    details: Configure cliff periods and linear unlock schedules enforced entirely on-chain. Four vesting modes from two parameters — no off-chain execution needed.

  - icon: 🎯
    title: Milestone-Gated Streams
    details: Lock tokens until a creator-confirmed milestone is reached. Perfect for team grants tied to product launches, sales targets, or governance votes.

  - icon: 🎮
    title: Campaign & Game Rewards
    details: Game publishers deposit a budget on-chain. Players earn tokens by hitting in-game targets, verified by a trusted game-server oracle.

  - icon: 🔒
    title: Trustless Escrow
    details: All tokens are held in PDA-owned escrow accounts. Neither creator nor recipient can unilaterally move funds — only the program logic can.

  - icon: ⚖️
    title: Prorated Cancellation
    details: Cancel any stream at any time. Vested tokens go to the recipient, unvested tokens return to the creator — calculated and settled atomically on-chain.

  - icon: 🧾
    title: Rent Recovery
    details: After a stream is fully settled, close_stream reclaims ~0.004 SOL rent from both the stream and escrow accounts.
---

<div style="text-align:center; padding: 48px 0 24px;">

## Program Info

| | |
|---|---|
| **Program ID (Devnet)** | `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq` |
| **Program ID (Localnet)** | `9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX` |
| **Framework** | Anchor 1.0.0 |
| **Instructions** | 9 (5 vesting + 4 campaign/milestone) |
| **Error Codes** | 21 |
| **Tests** | 41+ (all green ✅) |
| **Frontend** | [blockbite-tdp.vercel.app](https://blockbite-tdp.vercel.app) |

</div>
