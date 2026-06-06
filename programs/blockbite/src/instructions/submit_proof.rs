use anchor_lang::prelude::*;

use crate::state::MilestoneAccount;
use crate::errors::ErrorCode;

pub(crate) use super::_dispatch::__client_accounts_submit_proof;
pub use super::_dispatch::{SubmitProof, submit_proof_handler as handler};

/// Pure proof submission — used by `handler` and unit tests.
/// Stores the proof hash and flips the immutability guard.
/// Preconditions (verified, not already submitted) are enforced at the
/// account constraint level on `SubmitProof`, but re-checked here for
/// defense-in-depth so the pure function is safe to call directly.
pub fn submit_proof_impl(milestone: &mut MilestoneAccount, proof_hash: [u8; 32]) -> Result<()> {
    require!(!milestone.is_verified, ErrorCode::MilestoneAlreadyVerified);
    require!(!milestone.proof_submitted, ErrorCode::AlreadySubmitted);
    milestone.proof_hash = proof_hash;
    milestone.proof_submitted = true;
    Ok(())
}
