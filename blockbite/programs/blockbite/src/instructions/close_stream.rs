use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount};

use crate::state::StreamAccount;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct CloseStream<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// Stream must be settled (cancelled OR fully withdrawn) before closing.
    #[account(
        mut,
        seeds = [b"stream", stream.creator.as_ref(), stream.recipient.as_ref(), &stream.seed.to_le_bytes()],
        bump = stream.bump,
        constraint = stream.creator == creator.key() @ ErrorCode::Unauthorized,
        constraint = (
            stream.is_cancelled ||
            stream.amount_withdrawn == stream.total_amount
        ) @ ErrorCode::StreamNotCloseable,
        close = creator,
    )]
    pub stream: Box<Account<'info, StreamAccount>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = stream,
        seeds = [b"escrow", stream.key().as_ref()],
        bump,
    )]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,

    pub mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CloseStream>) -> Result<()> {
    let creator   = ctx.accounts.stream.creator;
    let recipient = ctx.accounts.stream.recipient;
    let seed      = ctx.accounts.stream.seed;
    let bump      = ctx.accounts.stream.bump;

    let seeds = &[
        b"stream",
        creator.as_ref(),
        recipient.as_ref(),
        &seed.to_le_bytes(),
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Close the (empty) escrow token account, returning its rent lamports to creator.
    let cpi_accounts = CloseAccount {
        account:     ctx.accounts.escrow_token_account.to_account_info(),
        destination: ctx.accounts.creator.to_account_info(),
        authority:   ctx.accounts.stream.to_account_info(),
    };
    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    ))?;

    // The `close = creator` constraint on `stream` causes Anchor to transfer
    // the stream account's remaining lamports to `creator` after this handler.

    msg!("Stream closed — rent returned to creator");
    Ok(())
}
