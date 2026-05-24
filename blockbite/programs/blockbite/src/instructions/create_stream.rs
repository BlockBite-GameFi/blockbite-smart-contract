use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::state::StreamAccount;
use crate::errors::ErrorCode;

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
#[instruction(total_amount: u64, start_time: i64, end_time: i64, cliff_time: i64, seed: u64, milestone_enabled: bool)]
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

pub fn handler(
    ctx: Context<CreateStream>,
    total_amount: u64,
    start_time: i64,
    end_time: i64,
    cliff_time: i64,
    seed: u64,
    milestone_enabled: bool,
) -> Result<()> {
    // ── Parameter validation ──────────────────────────────────────────────────
    require!(total_amount > 0, ErrorCode::InvalidAmount);
    require!(end_time > start_time, ErrorCode::InvalidTimestamp);
    require!(
        cliff_time == 0 || cliff_time <= end_time,
        ErrorCode::InvalidTimestamp
    );
    require!(
        ctx.accounts.creator.key() != ctx.accounts.recipient.key(),
        ErrorCode::InvalidRecipient
    );

    let decimals = ctx.accounts.mint.decimals;

    // ── Escrow deposit ────────────────────────────────────────────────────────
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

    // ── Initialise stream state ───────────────────────────────────────────────
    let stream = &mut ctx.accounts.stream;
    stream.creator               = ctx.accounts.creator.key();
    stream.recipient             = ctx.accounts.recipient.key();
    stream.mint                  = ctx.accounts.mint.key();
    stream.escrow_token_account  = ctx.accounts.escrow_token_account.key();
    stream.total_amount          = total_amount;
    stream.amount_withdrawn      = 0;
    stream.start_time            = start_time;
    stream.end_time              = end_time;
    stream.cliff_time            = cliff_time;
    stream.is_cancelled          = false;
    stream.bump                  = ctx.bumps.stream;
    stream.seed                  = seed;
    stream.milestone_reached     = false;
    stream.milestone_enabled     = milestone_enabled;

    msg!(
        "Stream created: total={} start={} end={} cliff={} milestone={}",
        total_amount, start_time, end_time, cliff_time, milestone_enabled
    );

    Ok(())
}
