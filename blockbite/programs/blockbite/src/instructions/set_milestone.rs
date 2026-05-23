use anchor_lang::prelude::*;

use crate::state::StreamAccount;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct SetMilestone<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stream", stream.creator.as_ref(), stream.recipient.as_ref(), &stream.seed.to_le_bytes()],
        bump = stream.bump,
        constraint = stream.creator == creator.key() @ ErrorCode::Unauthorized,
        constraint = !stream.milestone_reached @ ErrorCode::MilestoneAlreadyReached,
        constraint = !stream.is_cancelled @ ErrorCode::StreamCancelled,
    )]
    pub stream: Box<Account<'info, StreamAccount>>,
}

pub fn handler(ctx: Context<SetMilestone>) -> Result<()> {
    ctx.accounts.stream.milestone_reached = true;
    ctx.accounts.stream.milestone_enabled = true;
    Ok(())
}
