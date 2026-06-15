/**
 * Happy-path smoke test for BlockBite campaign → milestone → verify flow.
 *
 *   1. Create a fresh SPL mint (founder = mint authority).
 *   2. Mint 1000 test tokens into the founder ATA.
 *   3. create_campaign  — escrows 100 tokens under a campaign PDA.
 *   4. create_milestone — declares a 50-token milestone, gated by game-authority.
 *   5. POST /api/game/simulate                     — seeds session in Next.js.
 *   6. POST /api/game/verify with real PDAs       — game-authority signs verify_game.
 *   7. Read milestone account back from chain     — assert is_verified = true.
 *
 * Run:  node scripts/happy-path-smoke.js
 *
 * Env:
 *   HELIUS_DEVNET_RPC   (optional, defaults to env-baked Helius URL)
 *   GAME_AUTHORITY_PK   (optional, defaults to 8c81gBYsodzuoaTE85yjdCzHpsbXDFvs6UxYm4vVeU4q)
 *   WEB_BASE_URL        (optional, defaults to http://127.0.0.1:3000)
 */

const fs     = require('fs');
const crypto = require('crypto');
const path   = require('path');

const {
  Connection, Keypair, PublicKey,
  Transaction, TransactionInstruction, SystemProgram,
} = require(path.join(__dirname, '..', 'apps', 'web', 'node_modules', '@solana', 'web3.js'));

const {
  createMint, getOrCreateAssociatedTokenAccount, mintTo,
  TOKEN_PROGRAM_ID,
} = require(path.join(__dirname, '..', 'apps', 'web', 'node_modules', '@solana', 'spl-token'));

// ── Config ───────────────────────────────────────────────────────────────────
const RPC_URL = process.env.HELIUS_DEVNET_RPC
  || 'https://devnet.helius-rpc.com/?api-key=54fba1b0-7b4c-4e8d-a31f-31b34935f4b2';
const WEB_BASE_URL = process.env.WEB_BASE_URL || 'http://127.0.0.1:3000';
const PROGRAM_ID   = new PublicKey('Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq');
const GAME_AUTH    = new PublicKey(process.env.GAME_AUTHORITY_PK
  || '8c81gBYsodzuoaTE85yjdCzHpsbXDFvs6UxYm4vVeU4q');

// Instruction discriminators (sha256("global:<name>")[0..8])
const DISC = {
  create_campaign:  Buffer.from([111, 131, 187,  98, 160, 193, 114, 244]),
  create_milestone: Buffer.from([239,  58, 201,  28,  40, 186, 173,  48]),
  // verify_game is signed server-side by /api/game/verify — not built here.
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function loadDeployer() {
  const home = process.env.HOME;
  const raw  = fs.readFileSync(`${home}/.config/solana/id.json`, 'utf-8');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest();
}

function step(n, title) {
  console.log(`\n[${n}] ${title}`);
}

function ok(msg) { console.log('   ✓', msg); }
function fail(msg) { console.error('   ✗', msg); process.exit(1); }

async function postJson(url, body) {
  const r = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = { _raw: txt }; }
  return { status: r.status, body: j };
}

// ── Account decoders (mirrors programs/blockbite/src/state) ───────────────────
// CampaignAccount layout (after 8-byte discriminator):
//   [8..40]   founder         Pubkey
//   [40..72]  title_hash      [u8; 32]
//   [72..80]  total_budget    u64 LE
//   [80..88]  allocated       u64 LE
//   [88..96]  spent           u64 LE
//   [96]      bump            u8
//
// MilestoneAccount layout (after 8-byte discriminator):
//   [8..40]    campaign         Pubkey
//   [40..72]   recipient        Pubkey
//   [72..104]  description_hash [u8; 32]
//   [104..136] game_authority   Pubkey
//   [136..144] token_amount     u64 LE
//   [144]      target_level     u8
//   [145]      achieved_level   u8
//   [146]      difficulty       u8
//   [147]      is_verified      bool
//   [148]      is_claimed       bool
//   [149]      bump             u8
function decodeMilestone(data) {
  return {
    campaign:         new PublicKey(data.slice(8,   40)).toBase58(),
    recipient:        new PublicKey(data.slice(40,  72)).toBase58(),
    description_hash: data.slice(72, 104).toString('hex'),
    game_authority:   new PublicKey(data.slice(104, 136)).toBase58(),
    token_amount:     data.readBigUInt64LE(136).toString(),
    target_level:     data[144],
    achieved_level:   data[145],
    difficulty:       data[146],
    is_verified:      !!data[147],
    is_claimed:       !!data[148],
    bump:             data[149],
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const conn   = new Connection(RPC_URL, 'confirmed');
  const payer  = loadDeployer();
  console.log('RPC:    ', RPC_URL.replace(/api-key=[^&]+/, 'api-key=***'));
  console.log('Payer:  ', payer.publicKey.toBase58());
  console.log('Program:', PROGRAM_ID.toBase58());
  console.log('Game:   ', GAME_AUTH.toBase58());

  const bal = await conn.getBalance(payer.publicKey);
  if (bal < 0.05e9) fail(`payer has only ${bal/1e9} SOL — need 0.05+`);
  ok(`payer balance: ${(bal/1e9).toFixed(4)} SOL`);

  // ── (0) Fresh mint owned by payer ────────────────────────────────────────
  step(0, 'create fresh SPL mint (founder = mint authority)');
  const mint = await createMint(conn, payer, payer.publicKey, null, 6);
  ok(`mint: ${mint.toBase58()}`);

  const founderAta = await getOrCreateAssociatedTokenAccount(
    conn, payer, mint, payer.publicKey,
  );
  ok(`founder ATA: ${founderAta.address.toBase58()}`);
  await mintTo(conn, payer, mint, founderAta.address, payer, 1_000_000_000n); // 1000 tokens
  ok('minted 1000 tokens to founder');

  // ── (1) create_campaign ─────────────────────────────────────────────────
  step(1, 'build + send create_campaign');
  const campaignSeed   = BigInt(Date.now()); // unique per run, always positive
  const seedBytes      = Buffer.alloc(8); seedBytes.writeBigUInt64LE(campaignSeed, 0);
  const titleHash      = sha256(Buffer.from(`smoke-test-${campaignSeed}`));
  const totalBudget    = 100_000_000n; // 100 tokens

  const [campaignPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('campaign'), payer.publicKey.toBuffer(), seedBytes],
    PROGRAM_ID,
  );
  const [campaignEscrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('campaign_escrow'), campaignPda.toBuffer()],
    PROGRAM_ID,
  );

  // Encode: disc(8) + title_hash(32) + total_budget(u64) + seed(u64) = 56 bytes
  const createCampaignData = Buffer.alloc(56);
  DISC.create_campaign.copy(createCampaignData, 0);
  titleHash.copy(createCampaignData, 8);
  createCampaignData.writeBigUInt64LE(totalBudget, 40);
  createCampaignData.writeBigUInt64LE(campaignSeed, 48);

  const createCampaignIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey,           isSigner: true,  isWritable: true  },
      { pubkey: mint,                       isSigner: false, isWritable: false },
      { pubkey: founderAta.address,        isSigner: false, isWritable: true  },
      { pubkey: campaignEscrowPda,         isSigner: false, isWritable: true  },
      { pubkey: campaignPda,               isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,          isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,   isSigner: false, isWritable: false },
    ],
    data: createCampaignData,
  });

  let { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  let tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(createCampaignIx);
  tx.sign(payer);
  let sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  ok(`campaign created, sig: ${sig.slice(0, 16)}…`);
  ok(`campaign PDA: ${campaignPda.toBase58()}`);

  // ── (2) create_milestone ────────────────────────────────────────────────
  step(2, 'build + send create_milestone');
  const milestoneSeed  = 1n;
  const msSeedBytes    = Buffer.alloc(8); msSeedBytes.writeBigUInt64LE(milestoneSeed, 0);
  const descHash       = sha256(Buffer.from(`milestone-${campaignSeed}-${milestoneSeed}`));
  const tokenAmount    = 50_000_000n; // 50 tokens
  const targetLevel    = 5;
  const difficulty     = 1;

  const [milestonePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('milestone'), campaignPda.toBuffer(), msSeedBytes],
    PROGRAM_ID,
  );

  // Encode: disc(8) + desc_hash(32) + campaign_seed(u64) + milestone_seed(u64) +
  //         token_amount(u64) + game_authority(32) + recipient(32) + target_level(u8) + difficulty(u8) = 130 bytes
  const createMilestoneData = Buffer.alloc(130);
  DISC.create_milestone.copy(createMilestoneData, 0);
  descHash.copy(createMilestoneData, 8);
  createMilestoneData.writeBigUInt64LE(campaignSeed, 40);
  createMilestoneData.writeBigUInt64LE(milestoneSeed, 48);
  createMilestoneData.writeBigUInt64LE(tokenAmount, 56);
  GAME_AUTH.toBuffer().copy(createMilestoneData, 64);
  payer.publicKey.toBuffer().copy(createMilestoneData, 96);
  createMilestoneData[128] = targetLevel;
  createMilestoneData[129] = difficulty;

  const createMilestoneIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey,         isSigner: true,  isWritable: true  },
      { pubkey: campaignPda,             isSigner: false, isWritable: true  },
      { pubkey: milestonePda,            isSigner: false, isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: createMilestoneData,
  });

  ({ blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed'));
  tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(createMilestoneIx);
  tx.sign(payer);
  sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  ok(`milestone created, sig: ${sig.slice(0, 16)}…`);
  ok(`milestone PDA: ${milestonePda.toBase58()}`);

  // Confirm milestone exists + is_verified=false initially
  let milestoneAcc = await conn.getAccountInfo(milestonePda);
  if (!milestoneAcc) fail('milestone account not found after create');
  let ms = decodeMilestone(milestoneAcc.data);
  ok(`initial state: is_verified=${ms.is_verified}, is_claimed=${ms.is_claimed}`);

  // ── (3) POST /api/game/simulate ─────────────────────────────────────────
  step(3, 'POST /api/game/simulate to seed Next.js session');
  const userId    = `smoke-${campaignSeed}`;
  const sessionId = `sess-${campaignSeed}`;
  let res = await postJson(`${WEB_BASE_URL}/api/game/simulate`, {
    userId, sessionId, level: targetLevel,
  });
  if (res.status !== 200) fail(`simulate failed: ${JSON.stringify(res)}`);
  ok(`session stored: ${JSON.stringify(res.body)}`);

  // ── (4) POST /api/game/verify ───────────────────────────────────────────
  step(4, 'POST /api/game/verify (game-authority signs verify_game on-chain)');
  res = await postJson(`${WEB_BASE_URL}/api/game/verify`, {
    userId,
    gameSessionId: sessionId,
    campaignPda:   campaignPda.toBase58(),
    milestoneSeed: milestoneSeed.toString(),
    achievedLevel: targetLevel,
  });
  if (res.status !== 200) {
    console.error('   verify response:', JSON.stringify(res.body, null, 2));
    fail(`verify failed (status ${res.status})`);
  }
  ok(`verify response: ok=${res.body.ok} sig=${(res.body.signature||'').slice(0,16)}…`);

  // ── (5) Re-read milestone — expect is_verified = true ───────────────────
  step(5, 'read milestone back from chain');
  milestoneAcc = await conn.getAccountInfo(milestonePda);
  ms = decodeMilestone(milestoneAcc.data);
  console.log('   milestone state:', JSON.stringify(ms, null, 2));
  if (ms.is_verified !== true) fail('expected milestone.is_verified = true');
  ok('milestone.is_verified = true ✓');

  console.log('\n🎉 HAPPY PATH COMPLETE — frontend → RPC → on-chain → backend all green.');
  console.log('   campaign  =', campaignPda.toBase58());
  console.log('   milestone =', milestonePda.toBase58());
  console.log('   mint      =', mint.toBase58());
})().catch(e => {
  console.error('\n💥 SMOKE TEST FAILED:');
  console.error(e?.stack || e);
  process.exit(1);
});
