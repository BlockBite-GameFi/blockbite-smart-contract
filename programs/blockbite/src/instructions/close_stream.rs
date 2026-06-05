use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, CloseAccount, TransferChecked};

use crate::state::StreamAccount;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct CloseStream<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stream", creator.key().as_ref(), recipient.key().as_ref(), &stream.seed.to_le_bytes()],
        bump = stream.bump,
        constraint = stream.creator == creator.key() @ ErrorCode::Unauthorized,
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

pub fn handler(ctx: Context<CloseStream>) -> Result<()> {
    let stream = &ctx.accounts.stream;

    // Stream must be fully withdrawn or cancelled before closing
    require!(
        stream.is_cancelled || stream.amount_withdrawn >= stream.total_amount,
        ErrorCode::StreamNotSettled,
    );

    // Transfer any remaining dust from escrow back to creator
    let remaining = ctx.accounts.escrow_token_account.amount;
    if remaining > 0 {
        let seeds = &[
            b"stream",
            stream.creator.as_ref(),
            stream.recipient.as_ref(),
            &stream.seed.to_le_bytes(),
            &[stream.bump],
        ];
        let signer_seeds = &[&seeds[..]];

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
    let seeds = &[
        b"stream",
        stream.creator.as_ref(),
        stream.recipient.as_ref(),
        &stream.seed.to_le_bytes(),
        &[stream.bump],
    ];
    let signer_seeds = &[&seeds[..]];

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
