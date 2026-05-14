use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::state::StreamAccount;
use crate::errors::ErrorCode;

#[derive(Accounts)]
#[instruction(total_amount: u64, start_time: i64, end_time: i64, cliff_time: i64, seed: u64)]
pub struct CreateStream<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: recipient account
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
        space = StreamAccount::LEN + 8,
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
) -> Result<()> {
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

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.creator_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.escrow_token_account.to_account_info(),
        authority: ctx.accounts.creator.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
    );
    token::transfer_checked(cpi_ctx, total_amount, ctx.accounts.mint.decimals)?;

    let stream = &mut ctx.accounts.stream;
    stream.creator = ctx.accounts.creator.key();
    stream.recipient = ctx.accounts.recipient.key();
    stream.mint = ctx.accounts.mint.key();
    stream.escrow_token_account = ctx.accounts.escrow_token_account.key();
    stream.total_amount = total_amount;
    stream.amount_withdrawn = 0;
    stream.start_time = start_time;
    stream.end_time = end_time;
    stream.cliff_time = cliff_time;
    stream.is_cancelled = false;
    stream.bump = ctx.bumps.stream;
    stream.seed = seed;

    Ok(())
}
