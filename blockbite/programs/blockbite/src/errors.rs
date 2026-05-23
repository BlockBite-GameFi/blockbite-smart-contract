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

    #[msg("Stream is already cancelled")]
    AlreadyCancelled,
    #[msg("Stream is fully vested and cannot be cancelled")]
    FullyVested,
    #[msg("No tokens available to withdraw")]
    NothingToWithdraw,
    #[msg("Milestone has already been reached")]
    MilestoneAlreadyReached,
    #[msg("Cliff period has not been reached yet")]
    CliffNotReached,
    #[msg("Suspicious activity detected: too many rapid actions")]
    BotDetected,
    #[msg("Stream has expired and is no longer active")]
    StreamExpired,
    #[msg("Claim amount is below minimum threshold")]
    ClaimTooSmall,
    #[msg("Stream must be cancelled or fully withdrawn before it can be closed")]
    StreamNotCloseable,
}
