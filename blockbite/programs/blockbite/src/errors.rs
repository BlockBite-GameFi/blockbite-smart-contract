use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Signer is not authorised to perform this action")]
    Unauthorized,
    #[msg("Claimable amount is zero or exceeds unlocked tokens")]
    InsufficientUnlockedTokens,
    #[msg("Stream has been cancelled")]
    StreamCancelled,
    #[msg("Stream is already cancelled")]
    StreamAlreadyCancelled,
    #[msg("Stream has not started yet")]
    StreamNotStarted,
    #[msg("Invalid timestamps: end must be after start, cliff must be before end")]
    InvalidTimestamp,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Creator and recipient cannot be the same account")]
    InvalidRecipient,
}
