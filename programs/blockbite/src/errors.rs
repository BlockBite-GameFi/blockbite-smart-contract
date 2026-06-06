use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Signer is not authorised to perform this action")]
    Unauthorized,
    #[msg("No tokens available to withdraw")]
    NothingToWithdraw,
    #[msg("Stream has been cancelled")]
    StreamCancelled,
    #[msg("Stream is already cancelled")]
    AlreadyCancelled,
    #[msg("Stream has not started yet")]
    StreamNotStarted,
    #[msg("Invalid timestamps: end must be after start, cliff must be before end")]
    InvalidTimestamp,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Creator and recipient cannot be the same account")]
    InvalidRecipient,
    #[msg("Stream is fully vested and cannot be cancelled")]
    FullyVested,
    #[msg("Milestone has already been reached")]
    MilestoneAlreadyReached,
    // ── Campaign & Milestone ─────────────────────────────────────────────────
    #[msg("Campaign not found")]
    CampaignNotFound,
    #[msg("Milestone not found")]
    MilestoneNotFound,
    #[msg("Milestone has already been verified")]
    MilestoneAlreadyVerified,
    #[msg("Proof is invalid or does not match expected hash")]
    InvalidProof,
    #[msg("Campaign budget is insufficient for this milestone")]
    InsufficientBudget,
    #[msg("Milestone has not been verified yet")]
    MilestoneNotVerified,
    #[msg("Stream must be fully withdrawn or cancelled before closing")]
    StreamNotSettled,
    #[msg("Provided game program does not match the milestone's declared game program")]
    InvalidGameProgram,
    #[msg("Milestone reward has already been claimed")]
    AlreadyClaimed,
    #[msg("Proof has already been submitted for this milestone")]
    AlreadySubmitted,
}
