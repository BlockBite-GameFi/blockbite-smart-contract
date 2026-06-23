use anchor_lang::prelude::*;

use crate::state::MilestoneAccount;
use crate::errors::ErrorCode;
use crate::constants::{MIN_LEVEL, MAX_LEVEL};

pub(crate) use super::_dispatch::__client_accounts_verify_game;
pub use super::_dispatch::{VerifyGame, verify_game_handler as handler};

/// Pure game verification — used by `handler` and unit tests.
/// Checks that the signer matches the milestone's declared game authority,
/// validates the achieved level meets the target, and flips `is_verified`
/// to true while storing the achieved level.
pub fn verify_game_impl(
    milestone: &mut MilestoneAccount,
    game_authority: Pubkey,
    achieved_level: u8,
) -> Result<()> {
    require!(!milestone.is_verified, ErrorCode::MilestoneAlreadyVerified);
    require!(
        milestone.game_authority == game_authority,
        ErrorCode::InvalidGameAuthority,
    );
    require!(
        achieved_level >= MIN_LEVEL && achieved_level <= MAX_LEVEL,
        ErrorCode::InvalidLevel,
    );
    require!(
        achieved_level >= milestone.target_level,
        ErrorCode::LevelNotReached,
    );

    milestone.achieved_level = achieved_level;
    milestone.is_verified = true;
    Ok(())
}
