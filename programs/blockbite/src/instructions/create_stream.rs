use anchor_lang::prelude::*;

use crate::constants::{STREAM_FEE_BPS, FEE_BASIS_POINTS_DENOMINATOR};
use crate::state::StreamAccount;
use crate::errors::ErrorCode;

pub(crate) use super::_dispatch::__client_accounts_create_stream;
pub use super::_dispatch::{CreateStream, create_stream_handler as handler};

/// Pure fee computation for `create_stream`.
///
/// Returns the 0.9% fee in the smallest unit of the stream's mint.
/// `total_amount * STREAM_FEE_BPS / FEE_BASIS_POINTS_DENOMINATOR`
pub fn compute_stream_fee(total_amount: u64) -> Result<u64> {
    let fee = (total_amount as u128)
        .checked_mul(STREAM_FEE_BPS as u128)
        .ok_or(ErrorCode::InvalidAmount)?
        .checked_div(FEE_BASIS_POINTS_DENOMINATOR as u128)
        .ok_or(ErrorCode::InvalidAmount)?;
    u64::try_from(fee).map_err(|_| ErrorCode::InvalidAmount.into())
}

/// Pure initialiser for a new stream — used by `handler` and by unit tests.
/// Performs all parameter validation, populates every stream field, and
/// stores the protocol fee so the handler can route it to the treasury.
pub fn init_stream(
    stream: &mut StreamAccount,
    creator: Pubkey,
    recipient: Pubkey,
    mint: Pubkey,
    escrow_token_account: Pubkey,
    total_amount: u64,
    start_time: i64,
    end_time: i64,
    cliff_time: i64,
    seed: u64,
    milestone_enabled: bool,
    bump: u8,
    name: [u8; 32],
) -> Result<u64> {
    require!(total_amount > 0, ErrorCode::InvalidAmount);
    require!(end_time > start_time, ErrorCode::InvalidTimestamp);
    require!(
        cliff_time == 0 || cliff_time <= end_time,
        ErrorCode::InvalidTimestamp
    );
    require!(
        creator != recipient,
        ErrorCode::InvalidRecipient
    );

    let fee = compute_stream_fee(total_amount)?;

    stream.creator              = creator;
    stream.recipient            = recipient;
    stream.mint                 = mint;
    stream.escrow_token_account = escrow_token_account;
    stream.total_amount         = total_amount;
    stream.amount_withdrawn     = 0;
    stream.start_time           = start_time;
    stream.end_time             = end_time;
    stream.cliff_time           = cliff_time;
    stream.is_cancelled         = false;
    stream.bump                 = bump;
    stream.seed                 = seed;
    stream.milestone_reached    = false;
    stream.milestone_enabled    = milestone_enabled;
    stream.name                 = name;

    Ok(fee)
}
