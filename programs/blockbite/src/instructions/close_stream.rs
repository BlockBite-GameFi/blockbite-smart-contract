use anchor_lang::prelude::*;

use crate::state::StreamAccount;
use crate::errors::ErrorCode;

pub(crate) use super::_dispatch::__client_accounts_close_stream;
pub use super::_dispatch::{CloseStream, close_stream_handler as handler};

/// Pure pre-close validation — used by `handler` and unit tests.
/// Returns `Ok(())` if the stream is settled (cancelled or fully withdrawn).
pub fn validate_closeable(stream: &StreamAccount) -> Result<()> {
    require!(
        stream.is_cancelled || stream.amount_withdrawn >= stream.total_amount,
        ErrorCode::StreamNotSettled,
    );
    Ok(())
}

/// Returns the amount of dust left in the escrow that should be returned
/// to the creator before closing the account. Pure helper, unit-testable.
pub fn compute_close_dust(stream: &StreamAccount, escrow_amount: u64) -> u64 {
    if stream.is_cancelled {
        0
    } else {
        escrow_amount
    }
}
