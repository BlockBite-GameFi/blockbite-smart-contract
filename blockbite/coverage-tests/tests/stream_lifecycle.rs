//! Host-native coverage harness for the blockbite stream-vesting handlers.
//!
//! Runs the program through `solana-program-test` in `processor!` (native) mode
//! so cargo-llvm-cov can instrument the instruction handlers
//! (create_stream / withdraw / cancel / set_milestone) — code the TypeScript
//! surfpool suite exercises but a host coverage tool cannot see.
//!
//! Everything is built with solana-sdk types. We deliberately avoid Anchor's
//! pubkey-typed account builders (Anchor pins solana-pubkey 3.0 while solana-sdk
//! uses 4.x), and only borrow Anchor for `.data()` (discriminator + primitive
//! args, no pubkeys) and the program ID. SPL token accounts are pre-baked as raw
//! byte layouts, so no spl-token crate (yet another pubkey version) is needed.

use std::str::FromStr;

use anchor_lang::InstructionData;
use solana_program_test::{processor, ProgramTest, ProgramTestContext};
use solana_sdk::{
    account::Account,
    clock::Clock,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    rent::Rent,
    signature::{Keypair, Signer},
    system_program,
    transaction::Transaction,
};

const DECIMALS: u8 = 6;
type TxResult = Result<(), solana_program_test::BanksClientError>;

// ── pubkeys / pdas ─────────────────────────────────────────────────────────

fn pid() -> Pubkey {
    Pubkey::new_from_array(blockbite::ID.to_bytes())
}

fn spl_id() -> Pubkey {
    Pubkey::from_str("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").unwrap()
}

fn stream_pda(creator: &Pubkey, recipient: &Pubkey, seed: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[
            b"stream",
            creator.as_ref(),
            recipient.as_ref(),
            &seed.to_le_bytes(),
        ],
        &pid(),
    )
    .0
}

fn escrow_pda(stream: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"escrow", stream.as_ref()], &pid()).0
}

// ── raw SPL byte layouts (avoids spl-token dep / extra pubkey version) ───────

fn pack_mint(decimals: u8) -> Vec<u8> {
    let mut d = vec![0u8; 82];
    // mint_authority COption<Pubkey> [0..36] = None (tag 0)
    // supply u64 [36..44] = 0
    d[44] = decimals; // decimals
    d[45] = 1; // is_initialized = true
                // freeze_authority COption<Pubkey> [46..82] = None
    d
}

fn pack_token(mint: &Pubkey, owner: &Pubkey, amount: u64) -> Vec<u8> {
    let mut d = vec![0u8; 165];
    d[0..32].copy_from_slice(mint.as_ref());
    d[32..64].copy_from_slice(owner.as_ref());
    d[64..72].copy_from_slice(&amount.to_le_bytes());
    // delegate COption [72..108] = None
    d[108] = 1; // state = Initialized
                // is_native COption [109..121] = None
                // delegated_amount [121..129] = 0
                // close_authority COption [129..165] = None
    d
}

fn read_amount(data: &[u8]) -> u64 {
    u64::from_le_bytes(data[64..72].try_into().unwrap())
}

fn rent_exempt(len: usize) -> u64 {
    Rent::default().minimum_balance(len)
}

fn token_account(data: Vec<u8>) -> Account {
    Account {
        lamports: rent_exempt(data.len()),
        data,
        owner: spl_id(),
        executable: false,
        rent_epoch: 0,
    }
}

fn sol_account(sol: u64) -> Account {
    Account {
        lamports: sol * 1_000_000_000,
        data: vec![],
        owner: system_program::ID,
        executable: false,
        rent_epoch: 0,
    }
}

// ── environment ──────────────────────────────────────────────────────────────

struct Env {
    creator: Keypair,
    recipient: Keypair,
    mint: Pubkey,
    creator_ta: Pubkey,
    recipient_ta: Pubkey,
}

async fn boot(creator_amount: u64) -> (ProgramTestContext, Env) {
    let mut pt = ProgramTest::new("blockbite", pid(), processor!(blockbite::entry));

    let creator = Keypair::new();
    let recipient = Keypair::new();
    let mint = Pubkey::new_unique();
    let creator_ta = Pubkey::new_unique();
    let recipient_ta = Pubkey::new_unique();

    pt.add_account(creator.pubkey(), sol_account(50));
    pt.add_account(recipient.pubkey(), sol_account(50));
    pt.add_account(mint, token_account(pack_mint(DECIMALS)));
    pt.add_account(
        creator_ta,
        token_account(pack_token(&mint, &creator.pubkey(), creator_amount)),
    );
    pt.add_account(
        recipient_ta,
        token_account(pack_token(&mint, &recipient.pubkey(), 0)),
    );

    let ctx = pt.start_with_context().await;
    (
        ctx,
        Env { creator, recipient, mint, creator_ta, recipient_ta },
    )
}

async fn now_ts(ctx: &mut ProgramTestContext) -> i64 {
    let clock: Clock = ctx.banks_client.get_sysvar().await.unwrap();
    clock.unix_timestamp
}

async fn send(ctx: &mut ProgramTestContext, ix: Instruction, signers: &[&Keypair]) -> TxResult {
    let bh = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&signers[0].pubkey()), signers, bh);
    ctx.banks_client.process_transaction(tx).await
}

async fn bal(ctx: &mut ProgramTestContext, ta: &Pubkey) -> u64 {
    let acc = ctx.banks_client.get_account(*ta).await.unwrap().unwrap();
    read_amount(&acc.data)
}

// ── instruction builders ─────────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
fn create_stream_ix(
    env: &Env,
    total: u64,
    start: i64,
    end: i64,
    cliff: i64,
    seed: u64,
    milestone: bool,
) -> (Instruction, Pubkey) {
    let stream = stream_pda(&env.creator.pubkey(), &env.recipient.pubkey(), seed);
    let escrow = escrow_pda(&stream);
    let data = blockbite::instruction::CreateStream {
        total_amount: total,
        start_time: start,
        end_time: end,
        cliff_time: cliff,
        seed,
        milestone_enabled: milestone,
    }
    .data();
    let accounts = vec![
        AccountMeta::new(env.creator.pubkey(), true),
        AccountMeta::new_readonly(env.recipient.pubkey(), false),
        AccountMeta::new_readonly(env.mint, false),
        AccountMeta::new(env.creator_ta, false),
        AccountMeta::new(escrow, false),
        AccountMeta::new(stream, false),
        AccountMeta::new_readonly(spl_id(), false),
        AccountMeta::new_readonly(system_program::ID, false),
    ];
    (Instruction { program_id: pid(), accounts, data }, stream)
}

fn withdraw_ix(env: &Env, stream: Pubkey) -> Instruction {
    let escrow = escrow_pda(&stream);
    Instruction {
        program_id: pid(),
        accounts: vec![
            AccountMeta::new(env.recipient.pubkey(), true),
            AccountMeta::new(stream, false),
            AccountMeta::new_readonly(env.mint, false),
            AccountMeta::new(escrow, false),
            AccountMeta::new(env.recipient_ta, false),
            AccountMeta::new_readonly(spl_id(), false),
        ],
        data: blockbite::instruction::Withdraw {}.data(),
    }
}

fn cancel_ix(env: &Env, stream: Pubkey) -> Instruction {
    let escrow = escrow_pda(&stream);
    Instruction {
        program_id: pid(),
        accounts: vec![
            AccountMeta::new(env.creator.pubkey(), true),
            AccountMeta::new(stream, false),
            AccountMeta::new_readonly(env.mint, false),
            AccountMeta::new(escrow, false),
            AccountMeta::new(env.creator_ta, false),
            AccountMeta::new(env.recipient_ta, false),
            AccountMeta::new_readonly(spl_id(), false),
        ],
        data: blockbite::instruction::Cancel {}.data(),
    }
}

fn set_milestone_ix(env: &Env, stream: Pubkey) -> Instruction {
    Instruction {
        program_id: pid(),
        accounts: vec![
            AccountMeta::new(env.creator.pubkey(), true),
            AccountMeta::new(stream, false),
        ],
        data: blockbite::instruction::SetMilestone {}.data(),
    }
}

// ── tests ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn full_flow_create_withdraw_verify() {
    let (mut ctx, env) = boot(1_000_000).await;
    let now = now_ts(&mut ctx).await;

    let (ix, stream) = create_stream_ix(&env, 1_000_000, now - 100, now + 100, 0, 1, false);
    send(&mut ctx, ix, &[&env.creator]).await.unwrap();

    let escrow = escrow_pda(&stream);
    assert_eq!(bal(&mut ctx, &escrow).await, 1_000_000, "escrow funded");

    send(&mut ctx, withdraw_ix(&env, stream), &[&env.recipient])
        .await
        .unwrap();
    let got = bal(&mut ctx, &env.recipient_ta).await;
    assert!(got > 0 && got <= 1_000_000, "recipient got vested tokens: {got}");
}

#[tokio::test]
async fn cancel_returns_split() {
    let (mut ctx, env) = boot(1_000_000).await;
    let now = now_ts(&mut ctx).await;

    let (ix, stream) = create_stream_ix(&env, 1_000_000, now - 100, now + 100, 0, 7, false);
    send(&mut ctx, ix, &[&env.creator]).await.unwrap();
    let creator_before = bal(&mut ctx, &env.creator_ta).await;

    send(&mut ctx, cancel_ix(&env, stream), &[&env.creator])
        .await
        .unwrap();

    assert!(bal(&mut ctx, &env.recipient_ta).await > 0, "recipient vested share");
    assert!(
        bal(&mut ctx, &env.creator_ta).await > creator_before,
        "creator remainder back"
    );
}

#[tokio::test]
async fn set_milestone_then_double_fails() {
    let (mut ctx, env) = boot(1_000_000).await;
    let now = now_ts(&mut ctx).await;

    let (ix, stream) = create_stream_ix(&env, 1_000_000, now - 10, now + 1000, 0, 11, true);
    send(&mut ctx, ix, &[&env.creator]).await.unwrap();

    send(&mut ctx, set_milestone_ix(&env, stream), &[&env.creator])
        .await
        .unwrap();
    assert!(
        send(&mut ctx, set_milestone_ix(&env, stream), &[&env.creator])
            .await
            .is_err(),
        "second set_milestone must fail"
    );
}

#[tokio::test]
async fn zero_amount_rejected() {
    let (mut ctx, env) = boot(1_000_000).await;
    let now = now_ts(&mut ctx).await;
    let (ix, _) = create_stream_ix(&env, 0, now, now + 100, 0, 21, false);
    assert!(send(&mut ctx, ix, &[&env.creator]).await.is_err());
}

#[tokio::test]
async fn invalid_timestamp_rejected() {
    let (mut ctx, env) = boot(1_000_000).await;
    let now = now_ts(&mut ctx).await;
    let (ix, _) = create_stream_ix(&env, 1_000_000, now + 100, now, 0, 22, false);
    assert!(send(&mut ctx, ix, &[&env.creator]).await.is_err());
}

#[tokio::test]
async fn double_withdraw_nothing_left() {
    let (mut ctx, env) = boot(1_000_000).await;
    let now = now_ts(&mut ctx).await;
    // already fully vested
    let (ix, stream) = create_stream_ix(&env, 1_000_000, now - 1000, now - 1, 0, 31, false);
    send(&mut ctx, ix, &[&env.creator]).await.unwrap();

    send(&mut ctx, withdraw_ix(&env, stream), &[&env.recipient])
        .await
        .unwrap();
    assert_eq!(bal(&mut ctx, &env.recipient_ta).await, 1_000_000);
    assert!(
        send(&mut ctx, withdraw_ix(&env, stream), &[&env.recipient])
            .await
            .is_err(),
        "second withdraw has nothing"
    );
}
