use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::state::{CampaignAccount, MilestoneAccount};
use crate::errors::ErrorCode;

#[derive(Accounts)]
#[instruction(milestone_seed: u64, campaign_seed: u64)]
pub struct ClaimMilestone<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(
        mut,
        seeds = [b"milestone", milestone.campaign.as_ref(), &milestone_seed.to_le_bytes()],
        bump = milestone.bump,
        constraint = milestone.recipient == recipient.key() @ ErrorCode::Unauthorized,
        constraint = milestone.is_verified @ ErrorCode::MilestoneNotVerified,
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

pub fn handler(
    ctx: Context<ClaimMilestone>,
    _milestone_seed: u64,
    campaign_seed: u64,
) -> Result<()> {
    let amount = ctx.accounts.milestone.token_amount;
    let decimals = ctx.accounts.mint.decimals;

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
