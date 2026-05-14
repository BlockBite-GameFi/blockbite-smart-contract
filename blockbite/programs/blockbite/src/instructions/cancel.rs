use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::state::StreamAccount;
use crate::utils::calculate_unlocked;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stream", stream.creator.as_ref(), stream.recipient.as_ref(), &stream.seed.to_le_bytes()],
        bump = stream.bump,
        constraint = stream.creator == creator.key() @ ErrorCode::Unauthorized,
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

pub fn handler(ctx: Context<Cancel>) -> Result<()> {
    let stream = &ctx.accounts.stream;

    require!(!stream.is_cancelled, ErrorCode::StreamAlreadyCancelled);

    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    let unlocked = calculate_unlocked(stream, current_time);
    let recipient_due = unlocked
        .checked_sub(stream.amount_withdrawn)
        .unwrap_or(0);
    let creator_due = stream
        .total_amount
        .checked_sub(stream.amount_withdrawn)
        .unwrap()
        .checked_sub(recipient_due)
        .unwrap();

    let seeds = &[
        b"stream",
        stream.creator.as_ref(),
        stream.recipient.as_ref(),
        &stream.seed.to_le_bytes(),
        &[stream.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let escrow = ctx.accounts.escrow_token_account.to_account_info();
    let mint = ctx.accounts.mint.to_account_info();
    let stream_ai = ctx.accounts.stream.to_account_info();
    let token_program = ctx.accounts.token_program.to_account_info();

    if recipient_due > 0 {
        let cpi_accounts = TransferChecked {
            from: escrow.clone(),
            mint: mint.clone(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: stream_ai.clone(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            token_program.clone(),
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
            token_program,
            cpi_accounts,
            signer_seeds,
        );
        token::transfer_checked(cpi_ctx, creator_due, ctx.accounts.mint.decimals)?;
    }

    ctx.accounts.stream.is_cancelled = true;

    msg!("Cancelled: recipient_due={}, creator_due={}", recipient_due, creator_due);

    Ok(())
}
