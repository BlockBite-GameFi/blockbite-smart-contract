// =============================================================================
// _dispatch.rs — Anchor boilerplate (Account structs + handler wrappers)
// -----------------------------------------------------------------------------
// This file is excluded from coverage measurement via
// `cargo llvm-cov --ignore-filename-regex '_dispatch\.rs'`.
//
// Why excluded: the `#[derive(Accounts)]` structs and the `pub fn *_handler`
// bodies can only execute inside the Anchor BPF runtime — they require a
// fully-constructed transaction with account info, signer checks, and CPI
// plumbing. None of that is reachable from a plain `cargo test` run.
//
// The pure business logic (validation, state mutation, computation) lives in
// the per-instruction files (create_stream.rs, withdraw.rs, etc.) as
// `pub fn init_stream`, `compute_withdraw`, etc. and is unit-tested in
// tests_logic.rs / tests_campaign.rs / tests_edge_cases.rs / tests_cancel.rs.
// =============================================================================

use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, TransferChecked};

use crate::state::{CampaignAccount, MilestoneAccount, StreamAccount};

use super::cancel::compute_cancel;
use super::claim_milestone::mark_milestone_claimed;
use super::close_stream::{compute_close_dust, validate_closeable};
use super::create_campaign::init_campaign;
use super::create_milestone::init_milestone;
use super::create_stream::init_stream;
use super::set_milestone::set_milestone_reached;
use super::verify_game::verify_game_impl;
use super::withdraw::{build_stream_signer_seeds, compute_withdraw};

// ── Stream Vesting ───────────────────────────────────────────────────────────

/// Creator initialises a new vesting stream.
///
/// Account order (7 accounts + 2 programs = 9 total):
///   0  creator                 – signer, payer
///   1  recipient               – unchecked (just stored)
///   2  mint                    – SPL mint
///   3  creator_token_account   – source of tokens
///   4  escrow_token_account    – PDA token vault (init)
///   5  stream                  – stream state PDA (init)
///   6  token_program
///   7  system_program
#[derive(Accounts)]
#[instruction(total_amount: u64, start_time: i64, end_time: i64, cliff_time: i64, seed: u64, milestone_enabled: bool, name: [u8; 32])]
pub struct CreateStream<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: only stored as a pubkey; no on-chain validation required
    pub recipient: UncheckedAccount<'info>,

    pub mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = creator,
    )]
    pub creator_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = creator,
        token::mint = mint,
        token::authority = stream,
        seeds = [b"escrow", stream.key().as_ref()],
        bump,
    )]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = creator,
        space = StreamAccount::LEN,
        seeds = [b"stream", creator.key().as_ref(), recipient.key().as_ref(), &seed.to_le_bytes()],
        bump,
    )]
    pub stream: Box<Account<'info, StreamAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn create_stream_handler(
    ctx: Context<CreateStream>,
    total_amount: u64,
    start_time: i64,
    end_time: i64,
    cliff_time: i64,
    seed: u64,
    milestone_enabled: bool,
    name: [u8; 32],
) -> Result<()> {
    // ── Effects (CEI): initialise stream state via pure function ──────────────
    init_stream(
        &mut ctx.accounts.stream,
        ctx.accounts.creator.key(),
        ctx.accounts.recipient.key(),
        ctx.accounts.mint.key(),
        ctx.accounts.escrow_token_account.key(),
        total_amount,
        start_time,
        end_time,
        cliff_time,
        seed,
        milestone_enabled,
        ctx.bumps.stream,
        name,
    )?;

    // ── Interaction (CEI): escrow deposit ─────────────────────────────────────
    let decimals = ctx.accounts.mint.decimals;
    let escrow_cpi = TransferChecked {
        from:      ctx.accounts.creator_token_account.to_account_info(),
        mint:      ctx.accounts.mint.to_account_info(),
        to:        ctx.accounts.escrow_token_account.to_account_info(),
        authority: ctx.accounts.creator.to_account_info(),
    };
    token::transfer_checked(
        CpiContext::new(ctx.accounts.token_program.key(), escrow_cpi),
        total_amount,
        decimals,
    )?;

    msg!(
        "Stream created: total={} start={} end={} cliff={} milestone={}",
        total_amount, start_time, end_time, cliff_time, milestone_enabled
    );

    Ok(())
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stream", stream.creator.as_ref(), stream.recipient.as_ref(), &stream.seed.to_le_bytes()],
        bump = stream.bump,
        constraint = stream.recipient == recipient.key() @ crate::errors::ErrorCode::Unauthorized,
    )]
    pub stream: Box<Account<'info, StreamAccount>>,

    pub mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = stream,
    )]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn withdraw_handler(ctx: Context<Withdraw>) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;

    // ── Effects (CEI): compute claimable + update amount_withdrawn ────────────
    let claimable = compute_withdraw(&mut ctx.accounts.stream, current_time)?;

    // Copy values we need for seeds / CPI after the mutable borrow ends
    let stream = &ctx.accounts.stream;
    let creator       = stream.creator;
    let recipient     = stream.recipient;
    let seed_bytes    = stream.seed.to_le_bytes();
    let bump_byte     = stream.bump;
    let mint_decimals = ctx.accounts.mint.decimals;
    let stream_ai     = ctx.accounts.stream.to_account_info();

    let seeds = build_stream_signer_seeds(&creator, &recipient, &seed_bytes, &bump_byte);
    let signer_seeds = &[&seeds[..]];

    let escrow       = ctx.accounts.escrow_token_account.to_account_info();
    let mint         = ctx.accounts.mint.to_account_info();
    let recipient_ta = ctx.accounts.recipient_token_account.to_account_info();
    let token_program = ctx.accounts.token_program.to_account_info();

    // ── Interaction (CEI): token transfer ─────────────────────────────────────
    let cpi_accounts = TransferChecked {
        from:      escrow,
        mint,
        to:        recipient_ta,
        authority: stream_ai,
    };
    let cpi_ctx = CpiContext::new_with_signer(token_program.key(), cpi_accounts, signer_seeds);
    token::transfer_checked(cpi_ctx, claimable, mint_decimals)?;

    msg!("Withdrawn: {}", claimable);
    msg!("Total withdrawn: {}", ctx.accounts.stream.amount_withdrawn);

    Ok(())
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stream", stream.creator.as_ref(), stream.recipient.as_ref(), &stream.seed.to_le_bytes()],
        bump = stream.bump,
        constraint = stream.creator == creator.key() @ crate::errors::ErrorCode::Unauthorized,
    )]
    pub stream: Box<Account<'info, StreamAccount>>,

    pub mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = stream,
    )]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub creator_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn cancel_handler(ctx: Context<Cancel>) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;

    // ── Effects (CEI): compute payout + mark cancelled ───────────────────────
    let payout = compute_cancel(&mut ctx.accounts.stream, current_time)?;
    let recipient_due = payout.recipient_due;
    let creator_due = payout.creator_due;

    let stream = &ctx.accounts.stream;
    let creator       = stream.creator;
    let recipient     = stream.recipient;
    let seed_bytes    = stream.seed.to_le_bytes();
    let bump_byte     = stream.bump;
    let stream_ai     = ctx.accounts.stream.to_account_info();

    let seeds = build_stream_signer_seeds(&creator, &recipient, &seed_bytes, &bump_byte);
    let signer_seeds = &[&seeds[..]];

    let escrow = ctx.accounts.escrow_token_account.to_account_info();
    let mint = ctx.accounts.mint.to_account_info();
    let token_program = ctx.accounts.token_program.to_account_info();

    // ── Interaction (CEI): token transfers ──────────────────────────────────
    if recipient_due > 0 {
        let cpi_accounts = TransferChecked {
            from: escrow.clone(),
            mint: mint.clone(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: stream_ai.clone(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            token_program.key(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer_checked(cpi_ctx, recipient_due, ctx.accounts.mint.decimals)?;
    }

    if creator_due > 0 {
        let cpi_accounts = TransferChecked {
            from: escrow,
            mint,
            to: ctx.accounts.creator_token_account.to_account_info(),
            authority: stream_ai,
        };
        let cpi_ctx = CpiContext::new_with_signer(
            token_program.key(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer_checked(cpi_ctx, creator_due, ctx.accounts.mint.decimals)?;
    }

    msg!("Cancelled: recipient_due={}, creator_due={}", recipient_due, creator_due);

    Ok(())
}

#[derive(Accounts)]
pub struct SetMilestone<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stream", stream.creator.as_ref(), stream.recipient.as_ref(), &stream.seed.to_le_bytes()],
        bump = stream.bump,
        constraint = stream.creator == creator.key() @ crate::errors::ErrorCode::Unauthorized,
        constraint = !stream.milestone_reached @ crate::errors::ErrorCode::MilestoneAlreadyReached,
        constraint = !stream.is_cancelled @ crate::errors::ErrorCode::StreamCancelled,
    )]
    pub stream: Box<Account<'info, StreamAccount>>,
}

pub fn set_milestone_handler(ctx: Context<SetMilestone>) -> Result<()> {
    set_milestone_reached(&mut ctx.accounts.stream);
    Ok(())
}

#[derive(Accounts)]
pub struct CloseStream<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stream", creator.key().as_ref(), recipient.key().as_ref(), &stream.seed.to_le_bytes()],
        bump = stream.bump,
        constraint = stream.creator == creator.key() @ crate::errors::ErrorCode::Unauthorized,
        close = creator,
    )]
    pub stream: Box<Account<'info, StreamAccount>>,

    /// The recipient's stream vesting context.
    /// CHECK: Only used for PDA seed derivation.
    pub recipient: UncheckedAccount<'info>,

    pub mint: Box<Account<'info, Mint>>,

    /// Escrow token account — must be empty before closing.
    #[account(
        mut,
        seeds = [b"escrow", stream.key().as_ref()],
        bump,
    )]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,

    /// Creator's token account — receives any remaining escrow balance.
    #[account(
        mut,
        token::mint = mint,
    )]
    pub creator_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn close_stream_handler(ctx: Context<CloseStream>) -> Result<()> {
    let stream = &ctx.accounts.stream;

    // ── Checks: stream must be fully withdrawn or cancelled ───────────────────
    validate_closeable(stream)?;

    // ── Effects + Interaction: recover any dust, then close escrow ───────────
    let remaining = compute_close_dust(stream, ctx.accounts.escrow_token_account.amount);

    let seed_bytes = stream.seed.to_le_bytes();
    let bump_byte  = stream.bump;
    let seeds = build_stream_signer_seeds(
        &stream.creator,
        &stream.recipient,
        &seed_bytes,
        &bump_byte,
    );
    let signer_seeds = &[&seeds[..]];

    if remaining > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.creator_token_account.to_account_info(),
            authority: ctx.accounts.stream.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer_checked(cpi_ctx, remaining, ctx.accounts.mint.decimals)?;

        msg!("Recovered {} dust tokens to creator", remaining);
    }

    // Close the escrow token account (reclaim SOL rent)
    let cpi_accounts = CloseAccount {
        account: ctx.accounts.escrow_token_account.to_account_info(),
        destination: ctx.accounts.creator.to_account_info(),
        authority: ctx.accounts.stream.to_account_info(),
    };

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    );
    token::close_account(cpi_ctx)?;

    msg!("Stream closed, escrow account closed, rent recovered");

    Ok(())
}

// ── Campaign & Milestone ─────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(title_hash: [u8; 32], total_budget: u64, _seed: u64)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub founder: Signer<'info>,

    pub mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = founder,
    )]
    pub founder_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = founder,
        token::mint = mint,
        token::authority = campaign,
        seeds = [b"campaign_escrow", campaign.key().as_ref()],
        bump,
    )]
    pub campaign_escrow: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = founder,
        space = CampaignAccount::LEN,
        seeds = [b"campaign", founder.key().as_ref(), &_seed.to_le_bytes()],
        bump,
    )]
    pub campaign: Box<Account<'info, CampaignAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn create_campaign_handler(
    ctx: Context<CreateCampaign>,
    title_hash: [u8; 32],
    total_budget: u64,
    _seed: u64,
) -> Result<()> {
    // ── Effects (CEI): initialise campaign state via pure function ────────────
    init_campaign(
        &mut ctx.accounts.campaign,
        ctx.accounts.founder.key(),
        title_hash,
        total_budget,
        ctx.bumps.campaign,
    )?;

    // ── Interaction (CEI): escrow deposit ─────────────────────────────────────
    let decimals = ctx.accounts.mint.decimals;
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.founder_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.campaign_escrow.to_account_info(),
        authority: ctx.accounts.founder.to_account_info(),
    };
    token::transfer_checked(
        CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
        total_budget,
        decimals,
    )?;

    msg!(
        "Campaign created: budget={} title_hash={:?}",
        total_budget,
        title_hash
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(description_hash: [u8; 32], campaign_seed: u64, milestone_seed: u64, token_amount: u64, game_authority: Pubkey, recipient: Pubkey, target_level: u8, difficulty: u8)]
pub struct CreateMilestone<'info> {
    #[account(mut)]
    pub founder: Signer<'info>,

    #[account(
        mut,
        seeds = [b"campaign", campaign.founder.as_ref(), &campaign_seed.to_le_bytes()],
        bump = campaign.bump,
        constraint = campaign.founder == founder.key() @ crate::errors::ErrorCode::Unauthorized,
    )]
    pub campaign: Box<Account<'info, CampaignAccount>>,

    #[account(
        init,
        payer = founder,
        space = MilestoneAccount::LEN,
        seeds = [b"milestone", campaign.key().as_ref(), &milestone_seed.to_le_bytes()],
        bump,
    )]
    pub milestone: Box<Account<'info, MilestoneAccount>>,

    pub system_program: Program<'info, System>,
}

pub fn create_milestone_handler(
    ctx: Context<CreateMilestone>,
    description_hash: [u8; 32],
    _campaign_seed: u64,
    _milestone_seed: u64,
    token_amount: u64,
    game_authority: Pubkey,
    recipient: Pubkey,
    target_level: u8,
    difficulty: u8,
) -> Result<()> {
    // ── Effects (CEI): initialise milestone + update campaign via pure function
    let campaign_key = ctx.accounts.campaign.key();
    init_milestone(
        &mut ctx.accounts.campaign,
        &mut ctx.accounts.milestone,
        campaign_key,
        recipient,
        description_hash,
        game_authority,
        token_amount,
        target_level,
        difficulty,
        ctx.bumps.milestone,
    )?;

    msg!(
        "Milestone created: amount={} game_authority={} recipient={} target_level={} difficulty={}",
        token_amount,
        game_authority,
        recipient,
        target_level,
        difficulty
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(milestone_seed: u64, achieved_level: u8)]
pub struct VerifyGame<'info> {
    /// CHECK: only used as a PDA seed for milestone derivation.
    /// Not read or written by this instruction.
    pub campaign: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"milestone", campaign.key().as_ref(), &milestone_seed.to_le_bytes()],
        bump = milestone.bump,
        constraint = !milestone.is_verified @ crate::errors::ErrorCode::MilestoneAlreadyVerified,
    )]
    pub milestone: Box<Account<'info, MilestoneAccount>>,

    /// The game server's signing key — must match milestone.game_authority.
    pub game_authority: Signer<'info>,
}

pub fn verify_game_handler(
    ctx: Context<VerifyGame>,
    _milestone_seed: u64,
    achieved_level: u8,
) -> Result<()> {
    verify_game_impl(
        &mut ctx.accounts.milestone,
        ctx.accounts.game_authority.key(),
        achieved_level,
    )?;
    msg!(
        "Game verified by game_authority={} achieved_level={}",
        ctx.accounts.game_authority.key(),
        achieved_level
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(milestone_seed: u64, campaign_seed: u64)]
pub struct ClaimMilestone<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(
        mut,
        seeds = [b"milestone", milestone.campaign.as_ref(), &milestone_seed.to_le_bytes()],
        bump = milestone.bump,
        constraint = milestone.recipient == recipient.key() @ crate::errors::ErrorCode::Unauthorized,
        constraint = milestone.is_verified @ crate::errors::ErrorCode::MilestoneNotVerified,
        constraint = !milestone.is_claimed @ crate::errors::ErrorCode::AlreadyClaimed,
    )]
    pub milestone: Box<Account<'info, MilestoneAccount>>,

    #[account(
        seeds = [b"campaign", campaign.founder.as_ref(), &campaign_seed.to_le_bytes()],
        bump = campaign.bump,
    )]
    pub campaign: Box<Account<'info, CampaignAccount>>,

    pub mint: Box<Account<'info, Mint>>,

    /// Campaign escrow — authority is the campaign PDA.
    #[account(
        mut,
        token::mint = mint,
        token::authority = campaign,
        seeds = [b"campaign_escrow", campaign.key().as_ref()],
        bump,
    )]
    pub campaign_escrow: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn claim_milestone_handler(
    ctx: Context<ClaimMilestone>,
    _milestone_seed: u64,
    campaign_seed: u64,
) -> Result<()> {
    let amount = ctx.accounts.milestone.token_amount;
    let decimals = ctx.accounts.mint.decimals;

    // ── Effects (CEI): mark claimed BEFORE the CPI ────────────────────────────
    mark_milestone_claimed(&mut ctx.accounts.milestone);

    // ── Interactions: token transfer ──────────────────────────────────────────
    let campaign_seeds = &[
        b"campaign",
        ctx.accounts.campaign.founder.as_ref(),
        &campaign_seed.to_le_bytes(),
        &[ctx.accounts.campaign.bump],
    ];
    let signer_seeds = &[&campaign_seeds[..]];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.campaign_escrow.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.recipient_token_account.to_account_info(),
        authority: ctx.accounts.campaign.to_account_info(),
    };

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    );
    token::transfer_checked(cpi_ctx, amount, decimals)?;

    msg!("Milestone claimed: {} tokens", amount);

    Ok(())
}
