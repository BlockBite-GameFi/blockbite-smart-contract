use anchor_lang::prelude::*;

use crate::state::{CampaignAccount, MilestoneAccount};
use crate::errors::ErrorCode;
use crate::constants::{MIN_LEVEL, MAX_LEVEL, DIFFICULTY_EASY, DIFFICULTY_MEDIUM, DIFFICULTY_HARD};

pub(crate) use super::_dispatch::__client_accounts_create_milestone;
pub use super::_dispatch::{CreateMilestone, create_milestone_handler as handler};

/// Pure milestone initialiser — used by `handler` and unit tests.
/// Validates `token_amount`, checks the campaign budget, validates level
/// and difficulty, populates the MilestoneAccount, and updates the campaign's
/// allocated amount + count.
pub fn init_milestone(
    campaign: &mut CampaignAccount,
    milestone: &mut MilestoneAccount,
    campaign_key: Pubkey,
    recipient: Pubkey,
    description_hash: [u8; 32],
    game_authority: Pubkey,
    token_amount: u64,
    target_level: u8,
    difficulty: u8,
    bump: u8,
) -> Result<()> {
    require!(token_amount > 0, ErrorCode::InvalidAmount);
    require!(
        target_level >= MIN_LEVEL && target_level <= MAX_LEVEL,
        ErrorCode::InvalidLevel,
    );
    require!(
        difficulty >= DIFFICULTY_EASY && difficulty <= DIFFICULTY_HARD,
        ErrorCode::InvalidDifficulty,
    );

    let new_allocated = campaign
        .allocated_amount
        .checked_add(token_amount)
        .ok_or(ErrorCode::InsufficientBudget)?;
    require!(new_allocated <= campaign.total_budget, ErrorCode::InsufficientBudget);

    milestone.campaign = campaign_key;
    milestone.recipient = recipient;
    milestone.description_hash = description_hash;
    milestone.game_authority = game_authority;
    milestone.token_amount = token_amount;
    milestone.target_level = target_level;
    milestone.achieved_level = 0;
    milestone.difficulty = difficulty;
    milestone.is_verified = false;
    milestone.is_claimed = false;
    milestone.bump = bump;

    campaign.allocated_amount = new_allocated;
    campaign.milestone_count = campaign.milestone_count.saturating_add(1);

    Ok(())
}
