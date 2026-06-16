# Integration Guide — BlockBite Vesting Program

Panduan step-by-step untuk developer eksternal yang ingin membuat stream vesting menggunakan BlockBite. Tidak perlu baca source code — cukup ikuti panduan ini.

## Quick Reference

| | |
|---|---|
| **Program ID (Devnet)** | `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq` |
| **IDL (on-chain)** | `anchor.Program.fetchIdl(PROGRAM_ID, provider)` |
| **IDL (local)** | `target/idl/blockbite.json` |
| **Explorer** | [Solana Explorer (devnet)](https://explorer.solana.com/address/Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq?cluster=devnet) |
| **Test suite** | 28 integration tests `anchor test` |

---

## Prasyarat

| Paket | Versi | Kegunaan |
|-------|-------|---------|
| `@coral-xyz/anchor` | ^0.32.1 | Client library Anchor (IDL, instruction builder) |
| `@solana/web3.js` | ^1.98.2 | Koneksi Solana, keypair, transaksi |
| `@solana/spl-token` | ^0.4.14 | ATA (Associated Token Account) |
| Node.js | 20+ | Runtime |

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

---

## Langkah 1 — Setup Client

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

// Program ID di devnet
const PROGRAM_ID = new PublicKey("Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq");

// Koneksi ke devnet
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Wallet (pakai file JSON dari Solana CLI)
const wallet = anchor.Wallet.local(); // membaca ~/.config/solana/id.json

// Provider dan Program
const provider = new anchor.AnchorProvider(connection, wallet, {
  commitment: "confirmed",
});
anchor.setProvider(provider);

// Fetch IDL langsung dari chain (tidak perlu file lokal)
const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
const program = new anchor.Program(idl!, provider);
```

> **Catatan:** Jika pakai IDL lokal dari `anchor build`, gunakan `new anchor.Program(idl, provider)` dengan import langsung dari `target/idl/blockbite.json`.

---

## Langkah 2 — Derive PDA

Semua akun BlockBite adalah PDA (Program Derived Address) yang deterministik. Tidak perlu network call untuk menghitungnya.

### Stream PDA

```typescript
// Seeds: ["stream", creator_pubkey, recipient_pubkey, seed_u64_little_endian]
const seed = new anchor.BN(Date.now()); // seed unik — simpan untuk referensi nanti

const [streamPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("stream"),
    creator.publicKey.toBuffer(),      // 32 bytes
    recipient.publicKey.toBuffer(),    // 32 bytes
    seed.toArrayLike(Buffer, "le", 8), // 8 bytes little-endian
  ],
  PROGRAM_ID
);
```

### Escrow PDA (vault token)

```typescript
// Seeds: ["escrow", stream_pda]
// PENTING: derive SETELAH mendapat streamPda
const [escrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), streamPda.toBuffer()],
  PROGRAM_ID
);
```

### Tabel Semua PDA

| Akun | Seeds | Dari Mana |
|------|-------|-----------|
| `StreamAccount` | `["stream", creator, recipient, seed_le8]` | Diketahui sebelum transaksi |
| `EscrowTokenAccount` | `["escrow", stream_pda]` | Setelah dapat StreamPDA |
| `CampaignAccount` | `["campaign", founder, seed_le8]` | Untuk campaign |
| `CampaignEscrow` | `["campaign_escrow", campaign_pda]` | Setelah dapat CampaignPDA |
| `MilestoneAccount` | `["milestone", campaign_pda, milestone_seed_le8]` | Untuk milestone |

---

## Langkah 3 — Pastikan ATA Recipient Ada

Recipient **harus punya ATA** (Associated Token Account) untuk mint yang bersangkutan **sebelum** `create_stream` dipanggil.

> **Penyebab error paling umum:** Melewati langkah ini menyebabkan `withdraw` dan `cancel` gagal dengan `Error: Account does not exist` dari SPL Token. BlockBite tidak membuat ATA otomatis — itu tanggung jawab caller.

```typescript
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// Buat ATA recipient jika belum ada (idempotent — aman dipanggil berulang)
const recipientAta = await getOrCreateAssociatedTokenAccount(
  connection,
  creator,           // payer untuk membuat ATA — biasanya creator yang nanggung fee
  mint,
  recipient.publicKey
);

// Buat juga ATA creator — dibutuhkan saat cancel untuk menerima token unvested
const creatorAta = await getOrCreateAssociatedTokenAccount(
  connection, creator, mint, creator.publicKey
);
```

---

## Langkah 4 — Buat Stream

> **Perhatikan unit:** `total_amount` dalam raw unit (bukan UI). Untuk token 6 desimal, 10 token = `10_000_000`. Salah unit adalah bug yang paling sering terjadi dan tidak ada error — stream tetap dibuat dengan jumlah yang salah.

```typescript
const now = Math.floor(Date.now() / 1000); // Unix timestamp detik — BUKAN milidetik

const tx = await program.methods
  .createStream(
    new anchor.BN(10_000_000),        // total_amount: 10 token (6 desimal)
    new anchor.BN(now),                // start_time: mulai sekarang
    new anchor.BN(now + 86400 * 365), // end_time: 1 tahun
    new anchor.BN(now + 86400 * 90),  // cliff_time: 90 hari — pakai 0 untuk tanpa cliff
    seed,                              // seed: BN yang dibuat di langkah 2, simpan ini
    false                              // milestone_enabled: false = pure time-based vesting
  )
  .accounts({
    creator: creator.publicKey,
    recipient: recipient.publicKey,
    mint,
    creatorTokenAccount: creatorAta.address,
    escrowTokenAccount: escrowPda,
    stream: streamPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .signers([creator])
  .rpc();

console.log("Stream dibuat! TX:", tx);
console.log("Stream PDA:", streamPda.toBase58());
console.log("Escrow PDA:", escrowPda.toBase58());
// Simpan streamPda — dibutuhkan untuk semua instruksi selanjutnya
```

---

## Langkah 5 — Baca State Stream

```typescript
const stream = await program.account.streamAccount.fetch(streamPda);

console.log({
  creator:          stream.creator.toBase58(),
  recipient:        stream.recipient.toBase58(),
  totalAmount:      stream.totalAmount.toString(),
  amountWithdrawn:  stream.amountWithdrawn.toString(),
  startTime:        new Date(stream.startTime.toNumber() * 1000).toISOString(),
  endTime:          new Date(stream.endTime.toNumber() * 1000).toISOString(),
  cliffTime:        stream.cliffTime.toNumber(), // 0 = tidak ada cliff
  isCancelled:      stream.isCancelled,
  milestoneEnabled: stream.milestoneEnabled,
  milestoneReached: stream.milestoneReached,
});
```

---

## Langkah 6 — Withdraw Token

Recipient bisa withdraw kapan saja setelah ada token yang unlock.

```typescript
const withdrawTx = await program.methods
  .withdraw()
  .accounts({
    recipient: recipient.publicKey,
    stream: streamPda,
    escrowTokenAccount: escrowPda,
    recipientTokenAccount: recipientAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([recipient])
  .rpc();

console.log("Withdraw berhasil! TX:", withdrawTx);

// Cek saldo recipient setelah withdraw
const balance = await connection.getTokenAccountBalance(recipientAta.address);
console.log("Saldo recipient:", balance.value.uiAmount, "token");
```

**Hitung claimable sebelum kirim transaksi (hemat fee jika 0):**

```typescript
function hitungClaimable(stream: any, nowSecs: number): bigint {
  const now   = BigInt(nowSecs);
  const cliff = BigInt(stream.cliffTime.toString());
  const start = BigInt(stream.startTime.toString());
  const end   = BigInt(stream.endTime.toString());
  const total = BigInt(stream.totalAmount.toString());

  if (cliff > 0n && now < cliff)                       return 0n;
  if (stream.milestoneEnabled && !stream.milestoneReached) return 0n;
  if (now < start)                                      return 0n;
  if (now >= end)                                       return total;

  const effectiveStart = cliff > 0n ? cliff : start;
  const unlocked = (total * (now - effectiveStart)) / (end - effectiveStart);
  const withdrawn = BigInt(stream.amountWithdrawn.toString());
  return unlocked > withdrawn ? unlocked - withdrawn : 0n;
}

const streamData = await program.account.streamAccount.fetch(streamPda);
const claimable  = hitungClaimable(streamData, Math.floor(Date.now() / 1000));

if (claimable === 0n) {
  console.log("Belum ada token yang bisa diklaim");
} else {
  console.log(`Klaim ${claimable.toString()} raw token`);
  // lanjut panggil withdraw()
}
```

---

## Langkah 7 — Cancel Stream (Opsional)

Creator bisa cancel sebelum fully vested. Token dibagi prorated.

```typescript
const cancelTx = await program.methods
  .cancel()
  .accounts({
    creator: creator.publicKey,
    recipient: recipient.publicKey,
    stream: streamPda,
    escrowTokenAccount: escrowPda,
    creatorTokenAccount: creatorAta.address,
    recipientTokenAccount: recipientAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([creator])
  .rpc();

console.log("Stream cancelled! TX:", cancelTx);
```

---

## Langkah 8 — Close Stream (Recover Rent)

Setelah stream fully withdrawn ATAU cancelled, creator bisa close untuk recover ~0.004 SOL.

```typescript
const closeTx = await program.methods
  .closeStream()
  .accounts({
    creator: creator.publicKey,
    stream: streamPda,
    escrowTokenAccount: escrowPda,
    creatorTokenAccount: creatorAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([creator])
  .rpc();

console.log("Stream closed! Rent recovered. TX:", closeTx);
```

---

## Error Handling

Semua instruksi melempar `AnchorError` dengan kode numerik yang bisa ditangkap client. Jangan biarkan error mentah tampil ke user.

```typescript
import { AnchorError } from "@coral-xyz/anchor";

async function safeWithdraw(program: anchor.Program, accounts: object, signer: anchor.web3.Keypair) {
  try {
    const tx = await program.methods.withdraw().accounts(accounts).signers([signer]).rpc();
    return { ok: true, tx };
  } catch (err) {
    if (err instanceof AnchorError) {
      const code = err.error.errorCode.number;
      // Kode yang sering muncul saat withdraw:
      // 6001 NothingToWithdraw — cliff belum lewat atau milestone belum di-set
      // 6002 StreamCancelled   — stream sudah dibatalkan oleh creator
      // 6004 StreamNotStarted  — start_time belum tiba
      return { ok: false, code, message: err.error.errorMessage };
    }
    throw err; // error jaringan / RPC — lempar ulang
  }
}
```

Untuk daftar semua 21 error code, lihat [`ERROR_MAP.md`](./ERROR_MAP.md).

---

## Checklist Sebelum Go-Live

- [ ] Program ID sesuai cluster (`Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq` untuk devnet)
- [ ] Semua PDA di-derive dengan urutan seed yang benar (lihat Langkah 2)
- [ ] ATA recipient **sudah dibuat** sebelum `create_stream`
- [ ] `total_amount` dalam raw unit — 1 token 6-desimal = `1_000_000`, bukan `1`
- [ ] Semua timestamp dalam **Unix detik** — `Math.floor(Date.now() / 1000)`, bukan `Date.now()`
- [ ] Hitung `claimable` client-side sebelum `withdraw` untuk hindari fee sia-sia
- [ ] Error codes ditangani dengan pesan yang readable

---

## IDL & Types

```typescript
// Opsi 1: fetch langsung dari chain (tanpa file lokal)
const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
const program = new anchor.Program(idl!, provider);

// Opsi 2: import dari hasil anchor build (lebih cepat, offline)
import idl from "./target/idl/blockbite.json";
import type { Blockbite } from "./target/types/blockbite";
const program = new anchor.Program<Blockbite>(idl as anchor.Idl, provider);
```

---

## Campaign & Game Reward Integration

Subsistem kedua BlockBite: publisher membuat campaign reward, game server memverifikasi pencapaian, player mengklaim token.

**Flow:** `create_campaign` → `create_milestone` → `verify_game` → `claim_milestone`

### Langkah 9 — Buat Campaign

```typescript
import { createHash } from "crypto";

// SHA-256 dari judul campaign — konten lengkap disimpan off-chain
const titleHash = Array.from(createHash("sha256").update("Dragon Quest Season 1").digest());

const campaignSeed = new anchor.BN(1);

const [campaignPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("campaign"), founder.publicKey.toBuffer(), campaignSeed.toArrayLike(Buffer, "le", 8)],
  PROGRAM_ID
);
const [campaignEscrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
  PROGRAM_ID
);

const totalBudget = new anchor.BN(500_000_000); // 500 token (6 desimal)

await program.methods
  .createCampaign(titleHash, totalBudget, campaignSeed)
  .accounts({
    founder: founder.publicKey,
    mint,
    founderTokenAccount: founderAta.address,
    campaignAccount: campaignPda,
    campaignEscrow: campaignEscrowPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .signers([founder])
  .rpc();
```

### Langkah 10 — Tambah Milestone

```typescript
const descriptionHash = Array.from(
  createHash("sha256").update("Reach Level 10 in Dragon Dungeon").digest()
);

const milestoneSeed = new anchor.BN(1);

const [milestonePda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("milestone"),
    campaignPda.toBuffer(),
    milestoneSeed.toArrayLike(Buffer, "le", 8),
  ],
  PROGRAM_ID
);

await program.methods
  .createMilestone(
    descriptionHash,
    campaignSeed,       // campaign yang di-link
    milestoneSeed,      // seed unik untuk milestone ini
    new anchor.BN(50_000_000), // 50 token reward
    gameAuthority.publicKey,   // keypair game server yang akan sign verify_game
    player.publicKey,          // player yang bisa klaim
    10,                        // target_level: player harus reach level 10
    2                          // difficulty: 1=easy, 2=medium, 3=hard
  )
  .accounts({
    founder: founder.publicKey,
    campaignAccount: campaignPda,
    milestoneAccount: milestonePda,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .signers([founder])
  .rpc();
```

### Langkah 11 — Verifikasi (Game Server)

`verify_game` harus ditandatangani oleh `game_authority` — keypair yang ditetapkan saat `create_milestone`. Di production, ini adalah server-side keypair yang tidak pernah expose ke client.

```typescript
// Di server (bukan di client browser)
await program.methods
  .verifyGame(
    milestoneSeed,
    12           // achieved_level: level aktual yang dicapai player (>= target_level = pass)
  )
  .accounts({
    gameAuthority: gameAuthority.publicKey,
    milestoneAccount: milestonePda,
  })
  .signers([gameAuthority])
  .rpc();
```

> **Security:** `gameAuthority` keypair TIDAK boleh ada di frontend. Simpan sebagai environment variable server, tandatangani transaksi server-side, kirim TX yang sudah ditandatangani ke chain.

### Langkah 12 — Klaim Milestone (Player)

```typescript
// Derive player ATA terlebih dahulu
const playerAta = await getOrCreateAssociatedTokenAccount(
  connection, player, mint, player.publicKey
);

await program.methods
  .claimMilestone(milestoneSeed, campaignSeed)
  .accounts({
    player: player.publicKey,
    milestoneAccount: milestonePda,
    campaignAccount: campaignPda,
    campaignEscrow: campaignEscrowPda,
    playerTokenAccount: playerAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([player])
  .rpc();
```

**Guard:** `claim_milestone` set `is_claimed = true` **sebelum** token transfer (CEI pattern). Jika tx gagal di transfer tapi berhasil di state update, player bisa retry — idempotency guard mencegah double claim.

---

## Polling State <a name="polling-state"></a>

BlockBite tidak emit events on-chain. Untuk tracking perubahan di frontend, gunakan account subscription:

```typescript
// Subscribe ke perubahan StreamAccount — notified setiap ada withdraw/cancel
const subscriptionId = connection.onAccountChange(
  streamPda,
  async (accountInfo) => {
    const stream = program.coder.accounts.decode("streamAccount", accountInfo.data);
    console.log("Stream updated:", {
      withdrawn: stream.amountWithdrawn.toString(),
      cancelled: stream.isCancelled,
    });
  },
  "confirmed"
);

// Hentikan subscription saat komponen unmount
connection.removeAccountChangeListener(subscriptionId);
```

Untuk polling periodik (alternatif subscription):

```typescript
// Polling setiap 5 detik
const interval = setInterval(async () => {
  const stream = await program.account.streamAccount.fetch(streamPda);
  if (stream.isCancelled) {
    clearInterval(interval);
    console.log("Stream cancelled");
  }
}, 5000);
```

---

## Where to Ask

| Topik | Tempat |
|-------|--------|
| Bug on-chain / instruksi | [GitHub Issues](https://github.com/BlockBite-GameFi/blockbite-smart-contract/issues) |
| Integrasi frontend / client | [GitHub Issues](https://github.com/BlockBite-GameFi/blockbite-smart-contract/issues) |
| Program ID / IDL mismatch | Re-run `anchor build` lalu cek `target/idl/blockbite.json` |
| Error code tidak ada di daftar | Lihat `programs/blockbite/src/errors.rs` |
