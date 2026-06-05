use anchor_lang::prelude::*;

use crate::state::MilestoneAccount;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct SubmitProof<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(
        mut,
        constraint = milestone.recipient == recipient.key() @ ErrorCode::Unauthorized,
        constraint = !milestone.is_verified @ ErrorCode::MilestoneAlreadyVerified,
    )]
    pub milestone: Box<Account<'info, MilestoneAccount>>,
}

pub fn handler(ctx: Context<SubmitProof>, proof_hash: [u8; 32]) -> Result<()> {
    ctx.accounts.milestone.proof_hash = proof_hash;
    msg!("Proof submitted: hash={:?}", proof_hash);
    Ok(())
}
