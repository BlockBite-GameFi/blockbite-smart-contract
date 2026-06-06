use anchor_lang::prelude::*;

use crate::state::MilestoneAccount;

pub(crate) use super::_dispatch::__client_accounts_claim_milestone;
pub use super::_dispatch::{ClaimMilestone, claim_milestone_handler as handler};

/// Pure claim flip — used by `handler` and unit tests.
/// Sets `is_claimed = true` BEFORE the CPI to enforce idempotency.
pub fn mark_milestone_claimed(milestone: &mut MilestoneAccount) {
    milestone.is_claimed = true;
}
