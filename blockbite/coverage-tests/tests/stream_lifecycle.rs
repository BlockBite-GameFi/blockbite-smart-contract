//! Host-native coverage harness for the blockbite stream-vesting handlers.
//!
//! Runs the program through `solana-program-test` in `processor!` (native) mode
//! so cargo-llvm-cov can instrument the instruction handlers
//! (create_stream / withdraw / cancel / set_milestone) — code that the
//! TypeScript surfpool suite exercises but a host coverage tool cannot see.

use anchor_lang::{InstructionData, ToAccountMetas};
use solana_program_test::{processor, ProgramTest, ProgramTestContext};
use solana_sdk::{
    clock::Clock,
    instruction::Instruction,
    program_pack::Pack,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::Transaction,
};

const DECIMALS: u8 = 6;
const FUND: u64 = 5_000_000_000; // 5 SOL to the creator for rent/payer

fn program() -> ProgramTest {
    ProgramTest::new("blockbite", blockbite::ID, processor!(blockbite::entry))
}

async fn blockhash(ctx: &mut ProgramTestContext) -> solana_sdk::hash::Hash {
    ctx.banks_client.get_latest_blockhash().await.unwrap()
}

async fn now_ts(ctx: &mut ProgramTestContext) -> i64 {
    let clock: Clock = ctx.banks_client.get_sysvar().await.unwrap();
    clock.unix_timestamp
}

async fn send(
    ctx: &mut ProgramTestContext,
    ixs: &[Instruction],
    signers: &[&Keypair],
) -> Result<(), solana_program_test::BanksClientError> {
    let bh = blockhash(ctx).await;
    let mut all: Vec<&Keypair> = vec![&ctx.payer];
    all.extend_from_slice(signers);
    let tx = Transaction::new_signed_with_payer(ixs, Some(&ctx.payer.pubkey()), &all, bh);
    ctx.banks_client.process_transaction(tx).await
}

/// Fund `who` with SOL from the test payer.
async fn fund(ctx: &mut ProgramTestContext, who: &Pubkey, lamports: u64) {
    let ix = system_instruction::transfer(&ctx.payer.pubkey(), who, lamports);
    send(ctx, &[ix], &[]).await.unwrap();
}

/// Create + initialise an SPL mint. Returns the mint pubkey.
async fn create_mint(ctx: &mut ProgramTestContext, authority: &Keypair) -> Pubkey {
    let mint = Keypair::new();
    let rent = solana_sdk::rent::Rent::default().minimum_balance(spl_token::state::Mint::LEN);
    let create = system_instruction::create_account(
        &ctx.payer.pubkey(),
        &mint.pubkey(),
        rent,
        spl_token::state::Mint::LEN as u64,
        &spl_token::ID,
    );
    let init = spl_token::instruction::initialize_mint(
        &spl_token::ID,
        &mint.pubkey(),
        &authority.pubkey(),
        None,
        DECIMALS,
    )
    .unwrap();
    send(ctx, &[create, init], &[&mint]).await.unwrap();
    mint.pubkey()
}

/// Create an associated token account for `owner` + `mint`. Returns ATA pubkey.
async fn create_ata(ctx: &mut ProgramTestContext, owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    let ata = spl_associated_token_account::get_associated_token_address(owner, mint);
    let ix = spl_associated_token_account::instruction::create_associated_token_account(
        &ctx.payer.pubkey(),
        owner,
        mint,
        &spl_token::ID,
    );
    send(ctx, &[ix], &[]).await.unwrap();
    ata
}

async fn mint_to(
    ctx: &mut ProgramTestContext,
    mint: &Pubkey,
    dest: &Pubkey,
    authority: &Keypair,
    amount: u64,
) {
    let ix = spl_token::instruction::mint_to(
        &spl_token::ID,
        mint,
        dest,
        &authority.pubkey(),
        &[],
        amount,
    )
    .unwrap();
    send(ctx, &[ix], &[authority]).await.unwrap();
}

async fn token_balance(ctx: &mut ProgramTestContext, ata: &Pubkey) -> u64 {
    let acc = ctx.banks_client.get_account(*ata).await.unwrap().unwrap();
    spl_token::state::Account::unpack(&acc.data).unwrap().amount
}

fn stream_pda(creator: &Pubkey, recipient: &Pubkey, seed: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[
            b"stream",
            creator.as_ref(),
            recipient.as_ref(),
            &seed.to_le_bytes(),
        ],
        &blockbite::ID,
    )
    .0
}

fn escrow_pda(stream: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"escrow", stream.as_ref()], &blockbite::ID).0
}

/// Full fixture: funded creator, mint, creator ATA with `amount`, recipient ATA.
struct Fixture {
    creator: Keypair,
    recipient: Keypair,
    mint: Pubkey,
    creator_ata: Pubkey,
    recipient_ata: Pubkey,
}

async fn setup(ctx: &mut ProgramTestContext, amount: u64) -> Fixture {
    let creator = Keypair::new();
    let recipient = Keypair::new();
    fund(ctx, &creator.pubkey(), FUND).await;
    let mint = create_mint(ctx, &creator).await;
    let creator_ata = create_ata(ctx, &creator.pubkey(), &mint).await;
    let recipient_ata = create_ata(ctx, &recipient.pubkey(), &mint).await;
    mint_to(ctx, &mint, &creator_ata, &creator, amount).await;
    Fixture { creator, recipient, mint, creator_ata, recipient_ata }
}

#[allow(clippy::too_many_arguments)]
async fn create_stream(
    ctx: &mut ProgramTestContext,
    fx: &Fixture,
    total_amount: u64,
    start_time: i64,
    end_time: i64,
    cliff_time: i64,
    seed: u64,
    milestone_enabled: bool,
) -> Result<Pubkey, solana_program_test::BanksClientError> {
    let stream = stream_pda(&fx.creator.pubkey(), &fx.recipient.pubkey(), seed);
    let escrow = escrow_pda(&stream);
    let data = blockbite::instruction::CreateStream {
        total_amount,
        start_time,
        end_time,
        cliff_time,
        seed,
        milestone_enabled,
    }
    .data();
    let accounts = blockbite::accounts::CreateStream {
        creator: fx.creator.pubkey(),
        recipient: fx.recipient.pubkey(),
        mint: fx.mint,
        creator_token_account: fx.creator_ata,
        escrow_token_account: escrow,
        stream,
        token_program: spl_token::ID,
        system_program: solana_sdk::system_program::ID,
    }
    .to_account_metas(None);
    let ix = Instruction { program_id: blockbite::ID, accounts, data };
    send(ctx, &[ix], &[&fx.creator]).await.map(|_| stream)
}

async fn withdraw(
    ctx: &mut ProgramTestContext,
    fx: &Fixture,
    stream: Pubkey,
) -> Result<(), solana_program_test::BanksClientError> {
    let escrow = escrow_pda(&stream);
    let data = blockbite::instruction::Withdraw {}.data();
    let accounts = blockbite::accounts::Withdraw {
        recipient: fx.recipient.pubkey(),
        stream,
        mint: fx.mint,
        escrow_token_account: escrow,
        recipient_token_account: fx.recipient_ata,
        token_program: spl_token::ID,
    }
    .to_account_metas(None);
    let ix = Instruction { program_id: blockbite::ID, accounts, data };
    send(ctx, &[ix], &[&fx.recipient]).await
}

async fn cancel(
    ctx: &mut ProgramTestContext,
    fx: &Fixture,
    stream: Pubkey,
) -> Result<(), solana_program_test::BanksClientError> {
    let escrow = escrow_pda(&stream);
    let data = blockbite::instruction::Cancel {}.data();
    let accounts = blockbite::accounts::Cancel {
        creator: fx.creator.pubkey(),
        stream,
        mint: fx.mint,
        escrow_token_account: escrow,
        creator_token_account: fx.creator_ata,
        recipient_token_account: fx.recipient_ata,
        token_program: spl_token::ID,
    }
    .to_account_metas(None);
    let ix = Instruction { program_id: blockbite::ID, accounts, data };
    send(ctx, &[ix], &[&fx.creator]).await
}

async fn set_milestone(
    ctx: &mut ProgramTestContext,
    fx: &Fixture,
    stream: Pubkey,
) -> Result<(), solana_program_test::BanksClientError> {
    let data = blockbite::instruction::SetMilestone {}.data();
    let accounts = blockbite::accounts::SetMilestone {
        creator: fx.creator.pubkey(),
        stream,
    }
    .to_account_metas(None);
    let ix = Instruction { program_id: blockbite::ID, accounts, data };
    send(ctx, &[ix], &[&fx.creator]).await
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn full_flow_create_withdraw_verify() {
    let mut ctx = program().start_with_context().await;
    let fx = setup(&mut ctx, 1_000_000).await;
    let now = now_ts(&mut ctx).await;

    // ~50% elapsed linear stream
    let stream = create_stream(&mut ctx, &fx, 1_000_000, now - 100, now + 100, 0, 1, false)
        .await
        .unwrap();

    // escrow funded with the full amount
    let escrow = escrow_pda(&stream);
    assert_eq!(token_balance(&mut ctx, &escrow).await, 1_000_000);

    // withdraw the vested portion
    withdraw(&mut ctx, &fx, stream).await.unwrap();
    let got = token_balance(&mut ctx, &fx.recipient_ata).await;
    assert!(got > 0, "recipient received vested tokens");
    assert!(got <= 1_000_000);
}

#[tokio::test]
async fn cancel_returns_split() {
    let mut ctx = program().start_with_context().await;
    let fx = setup(&mut ctx, 1_000_000).await;
    let now = now_ts(&mut ctx).await;

    // ~50% vested, no withdraw → cancel must split between recipient & creator
    let stream = create_stream(&mut ctx, &fx, 1_000_000, now - 100, now + 100, 0, 7, false)
        .await
        .unwrap();
    let creator_before = token_balance(&mut ctx, &fx.creator_ata).await;

    cancel(&mut ctx, &fx, stream).await.unwrap();

    let recipient_after = token_balance(&mut ctx, &fx.recipient_ata).await;
    let creator_after = token_balance(&mut ctx, &fx.creator_ata).await;
    assert!(recipient_after > 0, "recipient got vested share");
    assert!(creator_after > creator_before, "creator got remainder back");
}

#[tokio::test]
async fn set_milestone_then_double_fails() {
    let mut ctx = program().start_with_context().await;
    let fx = setup(&mut ctx, 1_000_000).await;
    let now = now_ts(&mut ctx).await;

    // milestone-gated stream
    let stream = create_stream(&mut ctx, &fx, 1_000_000, now - 10, now + 1000, 0, 11, true)
        .await
        .unwrap();

    set_milestone(&mut ctx, &fx, stream).await.unwrap();
    // second call must fail (MilestoneAlreadyReached)
    assert!(set_milestone(&mut ctx, &fx, stream).await.is_err());
}

#[tokio::test]
async fn zero_amount_rejected() {
    let mut ctx = program().start_with_context().await;
    let fx = setup(&mut ctx, 1_000_000).await;
    let now = now_ts(&mut ctx).await;
    let res = create_stream(&mut ctx, &fx, 0, now, now + 100, 0, 21, false).await;
    assert!(res.is_err(), "zero amount must be rejected (InvalidAmount)");
}

#[tokio::test]
async fn invalid_timestamp_rejected() {
    let mut ctx = program().start_with_context().await;
    let fx = setup(&mut ctx, 1_000_000).await;
    let now = now_ts(&mut ctx).await;
    // end <= start
    let res = create_stream(&mut ctx, &fx, 1_000_000, now + 100, now, 0, 22, false).await;
    assert!(res.is_err(), "end<=start must be rejected (InvalidTimestamp)");
}

#[tokio::test]
async fn double_withdraw_nothing_left() {
    let mut ctx = program().start_with_context().await;
    let fx = setup(&mut ctx, 1_000_000).await;
    let now = now_ts(&mut ctx).await;
    // fully vested already → first withdraw takes all, second has nothing
    let stream = create_stream(&mut ctx, &fx, 1_000_000, now - 1000, now - 1, 0, 31, false)
        .await
        .unwrap();
    withdraw(&mut ctx, &fx, stream).await.unwrap();
    assert_eq!(token_balance(&mut ctx, &fx.recipient_ata).await, 1_000_000);
    // nothing left
    assert!(withdraw(&mut ctx, &fx, stream).await.is_err());
}
