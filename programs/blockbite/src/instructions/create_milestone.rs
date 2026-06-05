use anchor_lang::prelude::*;

use crate::state::{CampaignAccount, MilestoneAccount};
use crate::constants::{MAX_SIGNERS, VERIFICATION_ORACLE, VERIFICATION_GAME, VERIFICATION_MULTISIG};
use crate::errors::ErrorCode;

#[derive(Accounts)]
#[instruction(description_hash: [u8; 32], verification_type: u8, token_amount: u64, milestone_seed: u64, campaign_seed: u64)]
pub struct CreateMilestone<'info> {
    #[account(mut)]
    pub founder: Signer<'info>,

    #[account(
        mut,
        seeds = [b"campaign", campaign.founder.as_ref(), &campaign_seed.to_le_bytes()],
        bump = campaign.bump,
        constraint = campaign.founder == founder.key() @ ErrorCode::Unauthorized,
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

pub fn handler(
    ctx: Context<CreateMilestone>,
    description_hash: [u8; 32],
    verification_type: u8,
    _campaign_seed: u64,
    _milestone_seed: u64,
    token_amount: u64,
    oracle_pubkey: Pubkey,
    signer_count: u8,
    signers: [Pubkey; MAX_SIGNERS],
    game_program_id: Pubkey,
    recipient: Pubkey,
) -> Result<()> {
    require!(token_amount > 0, ErrorCode::InvalidAmount);
    require!(
        verification_type == VERIFICATION_ORACLE
            || verification_type == VERIFICATION_GAME
            || verification_type == VERIFICATION_MULTISIG,
        ErrorCode::InvalidTimestamp,
    );

    let campaign = &mut ctx.accounts.campaign;

    let new_allocated = campaign
        .allocated_amount
        .checked_add(token_amount)
        .ok_or(ErrorCode::InsufficientBudget)?;
    require!(new_allocated <= campaign.total_budget, ErrorCode::InsufficientBudget);

    if verification_type == VERIFICATION_MULTISIG {
        require!(signer_count > 0, ErrorCode::InsufficientSigners);
        require!(
            signer_count as usize <= MAX_SIGNERS,
            ErrorCode::InsufficientSigners,
        );
    }

    let milestone = &mut ctx.accounts.milestone;
    milestone.campaign = campaign.key();
    milestone.recipient = recipient;
    milestone.description_hash = description_hash;
    milestone.verification_type = verification_type;
    milestone.oracle_pubkey = oracle_pubkey;
    milestone.signer_count = signer_count;
    milestone.signers = signers;
    milestone.game_program_id = game_program_id;
    milestone.token_amount = token_amount;
    milestone.is_verified = false;
    milestone.proof_hash = [0u8; 32];
    milestone.bump = ctx.bumps.milestone;

    campaign.allocated_amount = new_allocated;
    campaign.milestone_count = campaign.milestone_count.saturating_add(1);

    msg!(
        "Milestone created: amount={} type={} recipient={}",
        token_amount,
        verification_type,
        recipient
    );

    Ok(())
}
