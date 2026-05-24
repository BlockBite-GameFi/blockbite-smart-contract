use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::state::CampaignAccount;
use crate::errors::ErrorCode;

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

pub fn handler(
    ctx: Context<CreateCampaign>,
    title_hash: [u8; 32],
    total_budget: u64,
    _seed: u64,
) -> Result<()> {
    require!(total_budget > 0, ErrorCode::InvalidAmount);

    let decimals = ctx.accounts.mint.decimals;

    // Transfer total_budget from founder → campaign_escrow
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

    let campaign = &mut ctx.accounts.campaign;
    campaign.founder = ctx.accounts.founder.key();
    campaign.title_hash = title_hash;
    campaign.total_budget = total_budget;
    campaign.allocated_amount = 0;
    campaign.milestone_count = 0;
    campaign.bump = ctx.bumps.campaign;

    msg!(
        "Campaign created: budget={} title_hash={:?}",
        total_budget,
        title_hash
    );

    Ok(())
}
