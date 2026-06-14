# Prerequisites

## Required Packages

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

| Package | Version | Purpose |
|---------|---------|---------|
| `@coral-xyz/anchor` | ^0.32.1 | Anchor client (IDL loading, instruction builders) |
| `@solana/web3.js` | ^1.98.2 | Solana connection, keypairs, transactions |
| `@solana/spl-token` | ^0.4.14 | ATA creation, mint operations |

---

## Get the IDL

The IDL (Interface Definition Language) file describes all instructions, accounts, and types. Get it one of three ways:

**From the repo:**
```bash
# After running anchor build
cp target/idl/blockbite.json ./src/blockbite.json
```

**From devnet (on-chain IDL):**
```bash
anchor idl fetch Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq \
  --provider.cluster devnet \
  -o blockbite.json
```

**Direct download:**
The IDL is published at the program address on devnet. Use `anchor idl fetch` as above.

---

## Wallet Setup

For server-side integrations, load a keypair:

```typescript
import { Keypair } from "@solana/web3.js";
import * as fs from "fs";

// From a JSON file (Solana CLI format)
const secretKey = JSON.parse(fs.readFileSync("~/.config/solana/id.json", "utf8"));
const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));
```

For browser (Phantom / other wallets):

```typescript
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";

const wallet = new PhantomWalletAdapter();
await wallet.connect();
```

---

## Provider Setup

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Connection, clusterApiUrl } from "@solana/web3.js";
import idl from "./blockbite.json";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq" // devnet
);

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Server-side: use NodeWallet
const wallet = new anchor.Wallet(payer);

// Browser: use AnchorProvider with adapter wallet
const provider = new anchor.AnchorProvider(connection, wallet, {
  commitment: "confirmed",
  preflightCommitment: "confirmed",
});

anchor.setProvider(provider);

const program = new anchor.Program(idl as anchor.Idl, provider);
```

---

## Token Accounts (ATAs)

BlockBite works with **Associated Token Accounts (ATAs)**. An ATA is a deterministic token account address derived from a wallet and a mint. Both the creator and recipient need ATAs for the token being streamed.

```typescript
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const recipientAta = await getOrCreateAssociatedTokenAccount(
  connection,
  payer,             // fee payer for ATA creation
  mint,              // SPL token mint
  recipient.publicKey
);
```

> **Important:** Create the recipient's ATA **before** creating the stream. If the ATA doesn't exist when `withdraw` or `cancel` is called, the transaction will fail.
