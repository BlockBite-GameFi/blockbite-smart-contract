use anchor_lang::prelude::*;

use crate::state::StreamAccount;
use crate::utils::calculate_unlocked;
use crate::errors::ErrorCode;

pub(crate) use super::_dispatch::__client_accounts_withdraw;
pub use super::_dispatch::{Withdraw, withdraw_handler as handler};

/// Pure claim computation — used by `handler` and unit tests.
/// Validates that withdrawal is allowed, computes the claimable amount,
/// and updates `stream.amount_withdrawn`. Returns the claimable amount.
pub fn compute_withdraw(stream: &mut StreamAccount, current_time: i64) -> Result<u64> {
    require!(!stream.is_cancelled, ErrorCode::StreamCancelled);
    require!(current_time >= stream.start_time, ErrorCode::StreamNotStarted);

    let unlocked = calculate_unlocked(stream, current_time);
    let claimable = unlocked
        .checked_sub(stream.amount_withdrawn)
        .ok_or(ErrorCode::NothingToWithdraw)?;
    require!(claimable > 0, ErrorCode::NothingToWithdraw);

    stream.amount_withdrawn = stream
        .amount_withdrawn
        .checked_add(claimable)
        .unwrap();
    Ok(claimable)
}

/// Pure PDA-seed array builder for a stream signer. Mirrors the seeds
/// declared in `Withdraw` / `Cancel` / `CloseStream` / `SetMilestone`.
/// `seed_bytes` and `bump_byte` must be the exact byte representations
/// stored on the stream account (LE-encoded seed, raw bump).
pub fn build_stream_signer_seeds<'a>(
    creator: &'a Pubkey,
    recipient: &'a Pubkey,
    seed_bytes: &'a [u8; 8],
    bump_byte: &'a u8,
) -> [&'a [u8]; 5] {
    [
        b"stream",
        creator.as_ref(),
        recipient.as_ref(),
        seed_bytes,
        std::slice::from_ref(bump_byte),
    ]
}
