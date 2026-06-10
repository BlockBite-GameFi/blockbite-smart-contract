# Campaign & Milestone — Integration Test Gap (TODO)

**Status:** 🟡 **Open** — discovered 2026-06-07

## The Gap

The game-based proof/verify/claim flow (`create_campaign` → `create_milestone` → `submit_proof` → `verify_game` → `claim_milestone`) is **not covered by any TypeScript integration test** on a real Solana validator.

Rust unit tests in `tests_logic.rs` + `tests_edge_cases.rs` cover each pure function in isolation (12 tests), but they cannot catch:
- Wrong 8-byte instruction discriminators in TS
- Wrong account order in the `keys` array
- Wrong PDA seed format on the TS side
- Actual CEI ordering at runtime (state flip before CPI)
- The `is_claimed` / `proof_submitted` guards under real BPF execution
- Security fix #12 (added `campaign` PDA seed constraint to `submit_proof`/`verify_game`)

## Current State in `tests/blockbite.ts`

Lines 1209-1268 contain the "Campaign & Milestone Flow" section. Of 4 tests:

| Line | Test | What it does |
|---|---|---|
| 1209 | `Creates a campaign with budget` | Uses `discriminator = [0,0,0,0,0,0,0,0]` (placeholder), wrapped in `try/catch` — does not actually verify the campaign is created |
| 1255 | `Campaign budget tracks allocated milestones` | `assert.ok(true, "tested in Rust")` — no-op placeholder |
| 1260 | `Milestone proof submission stores hash on-chain` | `assert.ok(true, "tested in Rust")` — no-op placeholder |
| 1265 | `Game verification marks milestone as verified` | `assert.ok(true, "tested in Rust")` — no-op placeholder |

**3 of 4 tests in this section are vacuous** and inflate the reported integration test count (28) without actually testing anything.

## What's Already Built

The TS client at `clients/ts/src/campaign-client.ts` has all the required builders and the correct discriminators computed from `sha256("global:<name>")[0..8]`. None of them are wired into an integration test.

```ts
// clients/ts/src/campaign-client.ts:38-42
const DISC_CREATE_CAMPAIGN  = Buffer.from([111, 131, 187, 98, 160, 193, 114, 244]);
const DISC_CREATE_MILESTONE = Buffer.from([239, 58, 201, 28, 40, 186, 173, 48]);
const DISC_SUBMIT_PROOF     = Buffer.from([54, 241, 46, 84, 4, 212, 46, 94]);
const DISC_VERIFY_GAME      = Buffer.from([81, 26, 37, 190, 207, 209, 205, 211]);
const DISC_CLAIM_MILESTONE  = Buffer.from([211, 134, 152, 37, 3, 82, 214, 189]);
```

```ts
// clients/ts/src/campaign-client.ts:235-365
function mkCreateCampaignIx(...)     // line 235
function mkCreateMilestoneIx(...)    // line 265
function mkSubmitProofIx(...)        // line 296
function mkVerifyGameIx(...)         // line 318
function mkClaimMilestoneIx(...)     // line 340
```

These are imported as helpers by the high-level API at `campaign-client.ts:381-508` (`createCampaign`, `createMilestone`, `submitProof`, `verifyGame`, `claimMilestone`).

## TODO: Template Test

Add the following to `tests/blockbite.ts`, replacing the 3 placeholders at lines 1255, 1260, 1265:

```ts
// =================================================================
// Campaign & Milestone — full proof/verify/claim e2e on SBF
// =================================================================

// Helper builders — copy these or import from clients/ts/src/campaign-client.ts
// (current tests/blockbite.ts inlines everything; either is fine)

function mkCreateCampaignData(titleHash: Buffer, totalBudget: bigint, seed: bigint): Buffer {
  const data = Buffer.alloc(56);
  Buffer.from([111, 131, 187, 98, 160, 193, 114, 244]).copy(data, 0);  // DISC_CREATE_CAMPAIGN
  titleHash.copy(data, 8);
  data.writeBigUInt64LE(totalBudget, 40);
  data.writeBigUInt64LE(seed, 48);
  return data;
}

function mkCreateMilestoneData(
  descHash: Buffer, campaignSeed: bigint, milestoneSeed: bigint,
  tokenAmount: bigint, gameProgramId: PublicKey, recipient: PublicKey,
): Buffer {
  const data = Buffer.alloc(128);
  Buffer.from([239, 58, 201, 28, 40, 186, 173, 48]).copy(data, 0);  // DISC_CREATE_MILESTONE
  descHash.copy(data, 8);
  data.writeBigUInt64LE(campaignSeed, 40);
  data.writeBigUInt64LE(milestoneSeed, 48);
  data.writeBigUInt64LE(tokenAmount, 56);
  gameProgramId.toBuffer().copy(data, 64);
  recipient.toBuffer().copy(data, 96);
  return data;
}

function mkSubmitProofData(milestoneSeed: bigint, proofHash: Buffer): Buffer {
  const data = Buffer.alloc(48);
  Buffer.from([54, 241, 46, 84, 4, 212, 46, 94]).copy(data, 0);  // DISC_SUBMIT_PROOF
  data.writeBigUInt64LE(milestoneSeed, 8);
  proofHash.copy(data, 16);
  return data;
}

function mkVerifyGameData(milestoneSeed: bigint, sessionResultHash: Buffer): Buffer {
  const data = Buffer.alloc(48);
  Buffer.from([81, 26, 37, 190, 207, 209, 205, 211]).copy(data, 0);  // DISC_VERIFY_GAME
  data.writeBigUInt64LE(milestoneSeed, 8);
  sessionResultHash.copy(data, 16);
  return data;
}

function mkClaimMilestoneData(milestoneSeed: bigint, campaignSeed: bigint): Buffer {
  const data = Buffer.alloc(24);
  Buffer.from([211, 134, 152, 37, 3, 82, 214, 189]).copy(data, 0);  // DISC_CLAIM_MILESTONE
  data.writeBigUInt64LE(milestoneSeed, 8);
  data.writeBigUInt64LE(campaignSeed, 16);
  return data;
}

it("Full milestone flow: create_campaign → create_milestone → submit_proof → verify_game → claim_milestone", async () => {
  // 1. Setup
  const founder   = Keypair.generate();
  const recipient = Keypair.generate();
  const gameProgramId = Keypair.generate().publicKey;  // any pubkey will do for this test
  const [s1, s2] = await Promise.all([
    provider.connection.requestAirdrop(founder.publicKey,   2 * anchor.web3.LAMPORTS_PER_SOL),
    provider.connection.requestAirdrop(recipient.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
  ]);
  await Promise.all([s1, s2].map(s => provider.connection.confirmTransaction(s, "confirmed")));

  const mint = await createMint(provider.connection, founder, founder.publicKey, null, 6);
  const founderTA   = (await getOrCreateAssociatedTokenAccount(provider.connection, founder,   mint, founder.publicKey)).address;
  const recipientTA = (await getOrCreateAssociatedTokenAccount(provider.connection, recipient, mint, recipient.publicKey)).address;
  const BUDGET     = 500_000n;
  const AMOUNT     = 100_000n;
  await mintTo(provider.connection, founder, mint, founderTA, founder, Number(BUDGET));

  const campaignSeed   = 100n;
  const milestoneSeed  = 200n;
  const [campaignPDA,  _cb] = PublicKey.findProgramAddressSync(
    [Buffer.from("campaign"), founder.publicKey.toBuffer(), Buffer.from(new BigUint64Array([campaignSeed]).buffer)],
    programId,
  );
  const [campaignEscrow, _eb] = PublicKey.findProgramAddressSync(
    [Buffer.from("campaign_escrow"), campaignPDA.toBuffer()], programId,
  );
  const [milestonePDA, _mb] = PublicKey.findProgramAddressSync(
    [Buffer.from("milestone"), campaignPDA.toBuffer(), Buffer.from(new BigUint64Array([milestoneSeed]).buffer)],
    programId,
  );

  // 2. create_campaign
  await provider.sendAndConfirm(
    new Transaction().add(new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: founder.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: mint,              isSigner: false, isWritable: false },
        { pubkey: founderTA,         isSigner: false, isWritable: true  },
        { pubkey: campaignEscrow,    isSigner: false, isWritable: true  },
        { pubkey: campaignPDA,       isSigner: false, isWritable: true  },
        { pubkey: TOKEN_PROGRAM_ID,  isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: mkCreateCampaignData(Buffer.alloc(32, 1), BUDGET, campaignSeed),
    })),
    [founder],
  );
  const campaignInfo = await provider.connection.getAccountInfo(campaignPDA);
  assert.ok(campaignInfo !== null, "Campaign account should exist");

  // 3. create_milestone
  await provider.sendAndConfirm(
    new Transaction().add(new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: founder.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: campaignPDA,       isSigner: false, isWritable: true  },
        { pubkey: milestonePDA,      isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: mkCreateMilestoneData(
        Buffer.alloc(32, 2), campaignSeed, milestoneSeed, AMOUNT, gameProgramId, recipient.publicKey,
      ),
    })),
    [founder],
  );

  // 4. submit_proof
  const proofHash = Buffer.alloc(32, 42);
  await provider.sendAndConfirm(
    new Transaction().add(new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: recipient.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: campaignPDA,          isSigner: false, isWritable: false },
        { pubkey: milestonePDA,         isSigner: false, isWritable: true  },
      ],
      programId,
      data: mkSubmitProofData(milestoneSeed, proofHash),
    })),
    [recipient],
  );

  // 5. verify_game — session_result_hash must EQUAL proof_hash
  await provider.sendAndConfirm(
    new Transaction().add(new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: campaignPDA,   isSigner: false, isWritable: false },
        { pubkey: milestonePDA,  isSigner: false, isWritable: true  },
        { pubkey: gameProgramId, isSigner: false, isWritable: false },
      ],
      programId,
      data: mkVerifyGameData(milestoneSeed, proofHash),  // ← same hash as proof
    })),
    [],
  );

  // 6. claim_milestone
  await provider.sendAndConfirm(
    new Transaction().add(new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: recipient.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: milestonePDA,         isSigner: false, isWritable: true  },
        { pubkey: campaignPDA,          isSigner: false, isWritable: false },
        { pubkey: mint,                 isSigner: false, isWritable: false },
        { pubkey: campaignEscrow,       isSigner: false, isWritable: true  },
        { pubkey: recipientTA,          isSigner: false, isWritable: true  },
        { pubkey: TOKEN_PROGRAM_ID,     isSigner: false, isWritable: false },
      ],
      programId,
      data: mkClaimMilestoneData(milestoneSeed, campaignSeed),
    })),
    [recipient],
  );

  // 7. Verify balance
  const bal = await getAccount(provider.connection, recipientTA);
  assert.strictEqual(Number(bal.amount), Number(AMOUNT), `Expected ${AMOUNT}, got ${bal.amount}`);

  // 8. Double-claim must fail (security fix #9: is_claimed guard)
  try {
    await provider.sendAndConfirm(
      new Transaction().add(new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: recipient.publicKey, isSigner: true,  isWritable: true  },
          { pubkey: milestonePDA,         isSigner: false, isWritable: true  },
          { pubkey: campaignPDA,          isSigner: false, isWritable: false },
          { pubkey: mint,                 isSigner: false, isWritable: false },
          { pubkey: campaignEscrow,       isSigner: false, isWritable: true  },
          { pubkey: recipientTA,          isSigner: false, isWritable: true  },
          { pubkey: TOKEN_PROGRAM_ID,     isSigner: false, isWritable: false },
        ],
        programId,
        data: mkClaimMilestoneData(milestoneSeed, campaignSeed),
      })),
      [recipient],
    );
    assert.fail("Double-claim should have failed");
  } catch (e: any) {
    assert.ok(
      e.message.includes("AlreadyClaimed") || e.message.includes("0x"),
      `Expected AlreadyClaimed, got: ${e.message}`,
    );
  }
});
```

This single test (≈180 lines including the 5 helper builders) closes all 5 gaps in one go.

## Negative-Only Tests (cheaper alternatives if e2e is blocked)

If the local validator (`solana-test-validator`) is unreliable, write just the negative tests — they don't require the full setup loop:

```ts
it("claim_milestone before submit_proof fails (MilestoneNotVerified)", ...);
it("submit_proof twice fails (AlreadySubmitted)", ...);
it("verify_game with wrong program fails (InvalidGameProgram)", ...);
it("verify_game with mismatched session hash fails (InvalidProof)", ...);
it("claim_milestone twice fails (AlreadyClaimed)", ...);
```

Each of these only needs to get to the milestone-created state, then exercises one failure path. They run in ~1s each and prove the security guards work without needing a successful end-to-end transfer.

## Run Command

```bash
cd /home/raisha/blockbite
anchor test                       # full suite (starts local validator)
# OR just the new tests:
yarn ts-mocha -p ./tsconfig.json -t 1000000 tests/blockbite.ts -g "Campaign"
```

## Related

- `SECURITY_CHECKLIST.md` §8 — issues #9 (double-claim), #10 (proof griefing), #12 (missing PDA seeds) all need this e2e test to be considered **fully verified**
- `tests_logic.rs:471-561` — the 11 pure-function unit tests this e2e test complements
