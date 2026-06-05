use anchor_lang::prelude::*;

use crate::state::MilestoneAccount;
use crate::constants::VERIFICATION_GAME;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct VerifyGame<'info> {
    #[account(
        constraint = milestone.verification_type == VERIFICATION_GAME @ ErrorCode::UnauthorizedVerifier,
        constraint = !milestone.is_verified @ ErrorCode::MilestoneAlreadyVerified,
    )]
    pub milestone: Box<Account<'info, MilestoneAccount>>,

    /// The game program that produced the session result.
    /// CHECK: This account is only used for key comparison against the
    /// declared game_program_id in the milestone. No data is read or written.
    pub game_program: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<VerifyGame>, session_result_hash: [u8; 32]) -> Result<()> {
    let milestone = &mut ctx.accounts.milestone;

    // Verify the game program ID matches the declared one
    require!(
        milestone.game_program_id == ctx.accounts.game_program.key(),
        ErrorCode::UnauthorizedVerifier,
    );

    // Verify the session result matches the submitted proof
    require!(
        milestone.proof_hash == session_result_hash,
        ErrorCode::InvalidProof,
    );

    milestone.is_verified = true;
    msg!("Game verification passed");

    Ok(())
}
