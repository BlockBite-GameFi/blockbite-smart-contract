pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

#[cfg(test)]
mod tests_cancel;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;

declare_id!("BHq8DC4EH5jzSs971YARefcAA5BF57oTQHRtqSX5pFRc");

#[program]
pub mod blockblast {
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
}
