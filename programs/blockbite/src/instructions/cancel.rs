use anchor_lang::prelude::*;

use crate::state::StreamAccount;
use crate::utils::calculate_unlocked;
use crate::errors::ErrorCode;

pub(crate) use super::_dispatch::__client_accounts_cancel;
pub use super::_dispatch::{Cancel, cancel_handler as handler};

/// Payout split returned by `compute_cancel`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CancelPayout {
    pub recipient_due: u64,
    pub creator_due:   u64,
}

/// Pure cancel computation — used by `handler` and unit tests.
/// Validates that cancellation is allowed, computes the payout split,
/// and marks the stream as cancelled. Returns the payout amounts.
pub fn compute_cancel(stream: &mut StreamAccount, current_time: i64) -> Result<CancelPayout> {
    require!(!stream.is_cancelled, ErrorCode::AlreadyCancelled);

    let unlocked = calculate_unlocked(stream, current_time);
    require!(unlocked < stream.total_amount, ErrorCode::FullyVested);

    let recipient_due = unlocked
        .checked_sub(stream.amount_withdrawn)
        .unwrap_or(0);
    let creator_due = stream
        .total_amount
        .checked_sub(stream.amount_withdrawn)
        .unwrap()
        .checked_sub(recipient_due)
        .unwrap();

    // ── Effects (CEI): mark cancelled BEFORE the CPI ────────────────────────
    stream.is_cancelled = true;

    Ok(CancelPayout { recipient_due, creator_due })
}
