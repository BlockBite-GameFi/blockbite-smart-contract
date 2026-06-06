use anchor_lang::prelude::*;

use crate::state::{CampaignAccount, MilestoneAccount};
use crate::errors::ErrorCode;

pub(crate) use super::_dispatch::__client_accounts_create_milestone;
pub use super::_dispatch::{CreateMilestone, create_milestone_handler as handler};

/// Pure milestone initialiser — used by `handler` and unit tests.
/// Validates `token_amount`, checks the campaign budget, populates the
/// MilestoneAccount, and updates the campaign's allocated amount + count.
pub fn init_milestone(
    campaign: &mut CampaignAccount,
    milestone: &mut MilestoneAccount,
    campaign_key: Pubkey,
    recipient: Pubkey,
    description_hash: [u8; 32],
    game_program_id: Pubkey,
    token_amount: u64,
    bump: u8,
) -> Result<()> {
    require!(token_amount > 0, ErrorCode::InvalidAmount);

    let new_allocated = campaign
        .allocated_amount
        .checked_add(token_amount)
        .ok_or(ErrorCode::InsufficientBudget)?;
    require!(new_allocated <= campaign.total_budget, ErrorCode::InsufficientBudget);

    milestone.campaign = campaign_key;
    milestone.recipient = recipient;
    milestone.description_hash = description_hash;
    milestone.game_program_id = game_program_id;
    milestone.token_amount = token_amount;
    milestone.is_verified = false;
    milestone.proof_hash = [0u8; 32];
    milestone.proof_submitted = false;
    milestone.is_claimed = false;
    milestone.bump = bump;

    campaign.allocated_amount = new_allocated;
    campaign.milestone_count = campaign.milestone_count.saturating_add(1);

    Ok(())
}
