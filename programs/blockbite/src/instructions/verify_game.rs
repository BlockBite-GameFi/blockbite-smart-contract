use anchor_lang::prelude::*;

use crate::state::MilestoneAccount;
use crate::errors::ErrorCode;

pub(crate) use super::_dispatch::__client_accounts_verify_game;
pub use super::_dispatch::{VerifyGame, verify_game_handler as handler};

/// Pure game verification — used by `handler` and unit tests.
/// Checks that the supplied game program matches the milestone's declared
/// game program, that the proof hash matches the session result, and
/// flips `is_verified` to true.
pub fn verify_game_impl(
    milestone: &mut MilestoneAccount,
    game_program: Pubkey,
    session_result_hash: [u8; 32],
) -> Result<()> {
    require!(!milestone.is_verified, ErrorCode::MilestoneAlreadyVerified);
    require!(
        milestone.game_program_id == game_program,
        ErrorCode::InvalidGameProgram,
    );
    require!(
        milestone.proof_hash == session_result_hash,
        ErrorCode::InvalidProof,
    );
    milestone.is_verified = true;
    Ok(())
}
