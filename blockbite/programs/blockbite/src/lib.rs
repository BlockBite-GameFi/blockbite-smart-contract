pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

#[cfg(test)]
mod tests_cancel;

use anchor_lang::prelude::*;

pub use errors::*;
pub use instructions::*;
pub use state::*;

declare_id!("Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq");

#[program]
pub mod blockbite {
    use super::*;

    pub fn create_stream(
        ctx: Context<CreateStream>,
        total_amount: u64,
        start_time: i64,
        end_time: i64,
        cliff_time: i64,
        seed: u64,
    ) -> Result<()> {
        create_stream::handler(ctx, total_amount, start_time, end_time, cliff_time, seed)
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
}
