import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { readFileSync } from 'node:fs';

// Reads the private key from a file (never passed on the command line) to avoid
// credential leakage into shell history / process args.
const WALLET_FILE = process.argv[2];   // path to wallet txt
const TARGET      = process.argv[3];   // recipient pubkey
const SOL         = parseFloat(process.argv[4] || '0.3');

// Extract the base58 secret that follows a "Priv:" label, or first 64-byte b58 line
const raw = readFileSync(WALLET_FILE, 'utf8');
let priv = null;
const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
for (let i = 0; i < lines.length; i++) {
  if (/^priv/i.test(lines[i])) {
    // key may be on same line after colon, or on the next non-empty line
    const inline = lines[i].split(':').slice(1).join(':').trim();
    priv = inline || lines[i + 1];
    break;
  }
}
if (!priv) {
  // fallback: first line that decodes to 64 bytes
  for (const l of lines) {
    try { if (bs58.decode(l).length === 64) { priv = l; break; } } catch {}
  }
}
if (!priv) throw new Error('No private key found in wallet file');

const conn   = new Connection('https://api.devnet.solana.com', 'confirmed');
const payer  = Keypair.fromSecretKey(bs58.decode(priv));
const target = new PublicKey(TARGET);

console.log('Payer :', payer.publicKey.toBase58());
console.log('Target:', target.toBase58());
console.log('Amount:', SOL, 'SOL');

const before = await conn.getBalance(target);
console.log('Target balance before:', before / LAMPORTS_PER_SOL, 'SOL');

const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
const tx = new Transaction();
tx.recentBlockhash = blockhash;
tx.feePayer = payer.publicKey;
tx.add(SystemProgram.transfer({
  fromPubkey: payer.publicKey,
  toPubkey:   target,
  lamports:   Math.round(SOL * LAMPORTS_PER_SOL),
}));
tx.sign(payer);

const sig = await conn.sendRawTransaction(tx.serialize(), { preflightCommitment: 'confirmed' });
console.log('Signature:', sig);
await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

const after = await conn.getBalance(target);
console.log('Target balance after :', after / LAMPORTS_PER_SOL, 'SOL');
console.log('DONE  https://explorer.solana.com/tx/' + sig + '?cluster=devnet');
