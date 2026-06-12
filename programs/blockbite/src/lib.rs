pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

#[cfg(test)]
mod tests_cancel;
#[cfg(test)]
mod tests_campaign;
#[cfg(test)]
mod tests_edge_cases;
#[cfg(test)]
mod tests_logic;

use anchor_lang::prelude::*;

pub use errors::*;
pub use instructions::*;
pub use state::*;

declare_id!("9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX");

#[program]
pub mod blockbite {
    use super::*;

    // ── Stream Vesting ────────────────────────────────────────────────────────

    pub fn create_stream(
        ctx: Context<CreateStream>,
        total_amount: u64,
        start_time: i64,
        end_time: i64,
        cliff_time: i64,
        seed: u64,
        milestone_enabled: bool,
        name: [u8; 32],
    ) -> Result<()> {
        create_stream::handler(ctx, total_amount, start_time, end_time, cliff_time, seed, milestone_enabled, name)
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        withdraw::handler(ctx)
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        cancel::handler(ctx)
    }

    pub fn set_milestone(ctx: Context<SetMilestone>) -> Result<()> {
        set_milestone::handler(ctx)
    }

    // ── Campaign & Milestone ──────────────────────────────────────────────────

    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        title_hash: [u8; 32],
        total_budget: u64,
        seed: u64,
    ) -> Result<()> {
        create_campaign::handler(ctx, title_hash, total_budget, seed)
    }

    pub fn create_milestone(
        ctx: Context<CreateMilestone>,
        description_hash: [u8; 32],
        campaign_seed: u64,
        milestone_seed: u64,
        token_amount: u64,
        game_authority: Pubkey,
        recipient: Pubkey,
        target_level: u8,
        difficulty: u8,
    ) -> Result<()> {
        create_milestone::handler(
            ctx,
            description_hash,
            campaign_seed,
            milestone_seed,
            token_amount,
            game_authority,
            recipient,
            target_level,
            difficulty,
        )
    }

    pub fn verify_game(
        ctx: Context<VerifyGame>,
        milestone_seed: u64,
        achieved_level: u8,
    ) -> Result<()> {
        verify_game::handler(ctx, milestone_seed, achieved_level)
    }

    pub fn claim_milestone(
        ctx: Context<ClaimMilestone>,
        milestone_seed: u64,
        campaign_seed: u64,
    ) -> Result<()> {
        claim_milestone::handler(ctx, milestone_seed, campaign_seed)
    }

    pub fn close_stream(ctx: Context<CloseStream>) -> Result<()> {
        close_stream::handler(ctx)
    }
}
