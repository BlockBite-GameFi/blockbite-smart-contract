use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::state::StreamAccount;
use crate::errors::ErrorCode;
use crate::constants::DEV_FEE_BPS;

/// Creator initialises a new vesting stream.
///
/// Account order (8 accounts + 2 programs = 10 total):
///   0  creator                 – signer, payer
///   1  recipient               – unchecked (just stored)
///   2  mint                    – SPL mint
///   3  creator_token_account   – source of tokens
///   4  escrow_token_account    – PDA token vault (init)
///   5  stream                  – stream state PDA (init)
///   6  developer_token_account – protocol fee destination (mut)
///   7  token_program
///   8  system_program
#[derive(Accounts)]
#[instruction(total_amount: u64, start_time: i64, end_time: i64, cliff_time: i64, seed: u64)]
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
        space = StreamAccount::LEN,   // LEN already includes the 8-byte discriminator
        seeds = [b"stream", creator.key().as_ref(), recipient.key().as_ref(), &seed.to_le_bytes()],
        bump,
    )]
    pub stream: Box<Account<'info, StreamAccount>>,

    /// Developer / protocol treasury token account.
    /// Receives DEV_FEE_BPS of `total_amount` from the creator.
    #[account(
        mut,
        token::mint = mint,
    )]
    pub developer_token_account: Box<Account<'info, TokenAccount>>,

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

    // ── Developer fee deposit ─────────────────────────────────────────────────
    // fee = total_amount * DEV_FEE_BPS / 10_000
    // Transferred creator → developer_token_account BEFORE escrow deposit so
    // the creator's balance is validated in a single flow.
    let dev_fee = total_amount
        .checked_mul(DEV_FEE_BPS)
        .unwrap()
        .checked_div(10_000)
        .unwrap();

    if dev_fee > 0 {
        let fee_cpi = TransferChecked {
            from:      ctx.accounts.creator_token_account.to_account_info(),
            mint:      ctx.accounts.mint.to_account_info(),
            to:        ctx.accounts.developer_token_account.to_account_info(),
            authority: ctx.accounts.creator.to_account_info(),
        };
        token::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), fee_cpi),
            dev_fee,
            decimals,
        )?;
        msg!("Dev fee transferred: {}", dev_fee);
    }

    // ── Escrow deposit ────────────────────────────────────────────────────────
    // Creator deposits exactly `total_amount` into the PDA escrow vault.
    let escrow_cpi = TransferChecked {
        from:      ctx.accounts.creator_token_account.to_account_info(),
        mint:      ctx.accounts.mint.to_account_info(),
        to:        ctx.accounts.escrow_token_account.to_account_info(),
        authority: ctx.accounts.creator.to_account_info(),
    };
    token::transfer_checked(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), escrow_cpi),
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
    stream.velocity_strikes      = 0;
    stream.last_action_ts        = 0;

    msg!(
        "Stream created: total={} dev_fee={} start={} end={} cliff={}",
        total_amount, dev_fee, start_time, end_time, cliff_time
    );

    Ok(())
}
