use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::state::StreamAccount;
use crate::utils::calculate_unlocked;
use crate::errors::ErrorCode;
use crate::constants::{MIN_ACTION_INTERVAL, MAX_VELOCITY_STRIKES};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stream", stream.creator.as_ref(), stream.recipient.as_ref(), &stream.seed.to_le_bytes()],
        bump = stream.bump,
        constraint = stream.recipient == recipient.key() @ ErrorCode::Unauthorized,
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

pub fn handler(ctx: Context<Withdraw>) -> Result<()> {
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    let stream = &ctx.accounts.stream;

    require!(!stream.is_cancelled, ErrorCode::StreamCancelled);
    require!(current_time >= stream.start_time, ErrorCode::StreamNotStarted);

    let unlocked = calculate_unlocked(stream, current_time);
    let claimable = unlocked
        .checked_sub(stream.amount_withdrawn)
        .ok_or(ErrorCode::NothingToWithdraw)?;

    require!(claimable > 0, ErrorCode::NothingToWithdraw);

    let creator = stream.creator;
    let recipient = stream.recipient;
    let seed = stream.seed;
    let bump = stream.bump;
    let mint_decimals = ctx.accounts.mint.decimals;
    let stream_ai = ctx.accounts.stream.to_account_info();

    // === VGPV Anti-Bot (Week 5) ===
    let stream_mut = &mut ctx.accounts.stream;
    require!(
        stream_mut.velocity_strikes < MAX_VELOCITY_STRIKES,
        ErrorCode::BotDetected
    );

    if stream_mut.last_action_ts > 0 {
        let interval = current_time
            .checked_sub(stream_mut.last_action_ts)
            .unwrap_or(i64::MAX);
        if interval < MIN_ACTION_INTERVAL {
            stream_mut.velocity_strikes = stream_mut.velocity_strikes.saturating_add(1);
            require!(
                stream_mut.velocity_strikes < MAX_VELOCITY_STRIKES,
                ErrorCode::BotDetected
            );
        }
    }
    stream_mut.last_action_ts = current_time;

    let seeds = &[
        b"stream",
        creator.as_ref(),
        recipient.as_ref(),
        &seed.to_le_bytes(),
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let escrow = ctx.accounts.escrow_token_account.to_account_info();
    let mint = ctx.accounts.mint.to_account_info();
    let recipient_ta = ctx.accounts.recipient_token_account.to_account_info();
    let token_program = ctx.accounts.token_program.to_account_info();

    let cpi_accounts = TransferChecked {
        from: escrow,
        mint,
        to: recipient_ta,
        authority: stream_ai,
    };
    let cpi_ctx = CpiContext::new_with_signer(token_program, cpi_accounts, signer_seeds);
    token::transfer_checked(cpi_ctx, claimable, mint_decimals)?;

    ctx.accounts.stream.amount_withdrawn = ctx
        .accounts
        .stream
        .amount_withdrawn
        .checked_add(claimable)
        .unwrap();

    msg!("Withdrawn: {}", claimable);
    msg!("Total withdrawn: {}", ctx.accounts.stream.amount_withdrawn);

    Ok(())
}
