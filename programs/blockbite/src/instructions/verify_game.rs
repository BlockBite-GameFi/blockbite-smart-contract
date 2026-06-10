use anchor_lang::prelude::*;

use crate::state::MilestoneAccount;
use crate::errors::ErrorCode;

pub(crate) use super::_dispatch::__client_accounts_verify_game;
pub use super::_dispatch::{VerifyGame, verify_game_handler as handler};

/// Pure game verification — used by `handler` and unit tests.
/// Checks that the signer matches the milestone's declared game authority
/// and flips `is_verified` to true.
pub fn verify_game_impl(
    milestone: &mut MilestoneAccount,
    game_authority: Pubkey,
) -> Result<()> {
    require!(!milestone.is_verified, ErrorCode::MilestoneAlreadyVerified);
    require!(
        milestone.game_authority == game_authority,
        ErrorCode::InvalidGameAuthority,
    );
    milestone.is_verified = true;
    Ok(())
}
