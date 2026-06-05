use anchor_lang::prelude::*;

use crate::state::MilestoneAccount;
use crate::constants::{VERIFICATION_MULTISIG, MAX_SIGNERS};
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct VerifyMultisig<'info> {
    pub signer_0: Signer<'info>,
    pub signer_1: Option<Signer<'info>>,
    pub signer_2: Option<Signer<'info>>,
    pub signer_3: Option<Signer<'info>>,
    pub signer_4: Option<Signer<'info>>,

    #[account(
        mut,
        constraint = milestone.verification_type == VERIFICATION_MULTISIG @ ErrorCode::UnauthorizedVerifier,
        constraint = !milestone.is_verified @ ErrorCode::MilestoneAlreadyVerified,
    )]
    pub milestone: Box<Account<'info, MilestoneAccount>>,
}

pub fn handler(ctx: Context<VerifyMultisig>) -> Result<()> {
    let milestone = &ctx.accounts.milestone;
    let required = milestone.signer_count as usize;
    require!(required > 0, ErrorCode::InsufficientSigners);
    require!(required <= MAX_SIGNERS, ErrorCode::InsufficientSigners);

    // Collect provided signers
    let provided: Vec<Pubkey> = vec![
        Some(ctx.accounts.signer_0.key()),
        ctx.accounts.signer_1.as_ref().map(|s| s.key()),
        ctx.accounts.signer_2.as_ref().map(|s| s.key()),
        ctx.accounts.signer_3.as_ref().map(|s| s.key()),
        ctx.accounts.signer_4.as_ref().map(|s| s.key()),
    ]
    .into_iter()
    .flatten()
    .collect();

    require!(provided.len() >= required, ErrorCode::InsufficientSigners);

    // Count how many provided signers are in the authorized list
    let mut valid_count: u8 = 0;
    for signer in &provided {
        for i in 0..MAX_SIGNERS {
            if milestone.signers[i] == *signer {
                valid_count = valid_count.saturating_add(1);
                break;
            }
        }
    }

    require!(
        valid_count as usize >= required,
        ErrorCode::InsufficientSigners,
    );

    // All checks passed — mark verified
    // We need mutable ref now that checks are done
    let m = &mut ctx.accounts.milestone;
    m.is_verified = true;
    msg!("Multisig verification passed: {} of {} signers", valid_count, required);

    Ok(())
}
