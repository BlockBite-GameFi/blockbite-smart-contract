use anchor_lang::prelude::*;

use crate::state::StreamAccount;
use crate::errors::ErrorCode;

pub(crate) use super::_dispatch::__client_accounts_create_stream;
pub use super::_dispatch::{CreateStream, create_stream_handler as handler};

/// Pure initialiser for a new stream — used by `handler` and by unit tests.
/// Performs all parameter validation and populates every stream field.
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
) -> Result<()> {
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

    Ok(())
}
