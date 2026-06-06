use anchor_lang::prelude::*;

use crate::state::CampaignAccount;
use crate::errors::ErrorCode;

pub(crate) use super::_dispatch::__client_accounts_create_campaign;
pub use super::_dispatch::{CreateCampaign, create_campaign_handler as handler};

/// Pure campaign initialiser — used by `handler` and unit tests.
/// Validates `total_budget` and populates the CampaignAccount.
pub fn init_campaign(
    campaign: &mut CampaignAccount,
    founder: Pubkey,
    title_hash: [u8; 32],
    total_budget: u64,
    bump: u8,
) -> Result<()> {
    require!(total_budget > 0, ErrorCode::InvalidAmount);

    campaign.founder = founder;
    campaign.title_hash = title_hash;
    campaign.total_budget = total_budget;
    campaign.allocated_amount = 0;
    campaign.milestone_count = 0;
    campaign.bump = bump;
    Ok(())
}
