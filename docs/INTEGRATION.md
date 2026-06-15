# Integration Guide — BlockBite Vesting Program

Panduan step-by-step untuk developer eksternal yang ingin membuat stream vesting menggunakan BlockBite. Tidak perlu baca source code — cukup ikuti panduan ini.

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

Recipient **harus punya ATA** (Associated Token Account) untuk mint yang bersangkutan **sebelum** stream dibuat. Kalau tidak ada, withdraw dan cancel akan gagal.

```typescript
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// Buat ATA recipient jika belum ada
const recipientAta = await getOrCreateAssociatedTokenAccount(
  connection,
  creator, // payer untuk membuat ATA
  mint,    // SPL mint address
  recipient.publicKey
);

// Juga buat ATA creator (untuk menerima token kembali saat cancel)
const creatorAta = await getOrCreateAssociatedTokenAccount(
  connection, creator, mint, creator.publicKey
);
```

---

## Langkah 4 — Buat Stream

```typescript
const now = Math.floor(Date.now() / 1000); // Unix timestamp sekarang (detik)

const tx = await program.methods
  .createStream(
    new anchor.BN(10_000_000),        // total_amount: 10 token (6 desimal = 10_000_000 raw)
    new anchor.BN(now),                // start_time: mulai sekarang
    new anchor.BN(now + 86400 * 365), // end_time: 1 tahun dari sekarang
    new anchor.BN(now + 86400 * 90),  // cliff_time: cliff 90 hari (0 = tanpa cliff)
    seed,                              // seed: simpan untuk reference nanti
    false                              // milestone_enabled: false = pure time-based
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

## Checklist Sebelum Go-Live

- [ ] Program ID sesuai cluster yang digunakan (devnet vs mainnet)
- [ ] Semua PDA di-derive dengan urutan seed yang benar
- [ ] ATA recipient dibuat sebelum stream creation
- [ ] `total_amount` dalam raw unit (bukan UI unit)
- [ ] Semua timestamp dalam Unix detik (bukan milidetik)
- [ ] Error codes ditangani dan ditampilkan sebagai pesan yang readable (lihat [`ERROR_MAP.md`](./ERROR_MAP.md))

---

## Link IDL & Types

Setelah `anchor build`, file IDL tersedia di:
- `target/idl/blockbite.json` — IDL lengkap untuk client
- `target/types/blockbite.ts` — TypeScript types yang di-generate otomatis

Atau fetch langsung dari chain:
```typescript
const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
```

---

> **Catatan untuk tim Marketing:** Bagian "Hitung claimable sebelum kirim transaksi" menjelaskan cara menghindari transaksi gagal. Pertimbangkan untuk menambahkan callout/box visual di GitBook agar mudah ditemukan oleh developer yang baru.
