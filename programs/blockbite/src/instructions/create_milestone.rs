use anchor_lang::prelude::*;

use crate::constants::{MIN_LEVEL, MAX_LEVEL, DIFFICULTY_EASY, DIFFICULTY_HARD, GAME_VERIFICATION_FEE_BPS, FEE_BASIS_POINTS_DENOMINATOR};
use crate::state::{CampaignAccount, MilestoneAccount};
use crate::errors::ErrorCode;

pub(crate) use super::_dispatch::__client_accounts_create_milestone;
pub use super::_dispatch::{CreateMilestone, create_milestone_handler as handler};

/// Pure fee computation for the game-verification leg of `create_milestone`.
///
/// Returns the 0.1% fee in the smallest unit of the campaign's mint, or 0
/// if no game authority is set (i.e. the milestone is funded but not gated
/// by an off-chain game oracle).
pub fn compute_game_verification_fee(token_amount: u64, game_authority: Pubkey) -> Result<u64> {
    if game_authority == Pubkey::default() {
        return Ok(0);
    }
    let fee = (token_amount as u128)
        .checked_mul(GAME_VERIFICATION_FEE_BPS as u128)
        .ok_or(ErrorCode::InvalidAmount)?
        .checked_div(FEE_BASIS_POINTS_DENOMINATOR as u128)
        .ok_or(ErrorCode::InvalidAmount)?;
    u64::try_from(fee).map_err(|_| ErrorCode::InvalidAmount.into())
}

/// Pure milestone initialiser — used by `handler` and unit tests.
/// Validates `token_amount`, checks the campaign budget (recipient allocation
/// plus any game-verification fee), validates level and difficulty, populates
/// the MilestoneAccount, and updates the campaign's allocated amount, fee
/// reservation, and count. Returns the fee to charge (0 if no game authority).
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
) -> Result<u64> {
    require!(token_amount > 0, ErrorCode::InvalidAmount);
    require!(
        target_level >= MIN_LEVEL && target_level <= MAX_LEVEL,
        ErrorCode::InvalidLevel,
    );
    require!(
        difficulty >= DIFFICULTY_EASY && difficulty <= DIFFICULTY_HARD,
        ErrorCode::InvalidDifficulty,
    );

    let fee = compute_game_verification_fee(token_amount, game_authority)?;

    let new_allocated = campaign
        .allocated_amount
        .checked_add(token_amount)
        .ok_or(ErrorCode::InsufficientBudget)?;
    let new_fees = campaign
        .allocated_fees
        .checked_add(fee)
        .ok_or(ErrorCode::InsufficientBudget)?;
    let total_committed = new_allocated
        .checked_add(new_fees)
        .ok_or(ErrorCode::InsufficientBudget)?;
    require!(
        total_committed <= campaign.total_budget,
        ErrorCode::InsufficientBudgetForFee
    );

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
    campaign.allocated_fees   = new_fees;
    campaign.milestone_count  = campaign.milestone_count.saturating_add(1);

    Ok(fee)
}
