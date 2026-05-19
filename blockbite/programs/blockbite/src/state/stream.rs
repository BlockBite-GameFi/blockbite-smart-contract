use anchor_lang::prelude::*;

#[account]
pub struct StreamAccount {
    pub creator: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub escrow_token_account: Pubkey,
    pub total_amount: u64,
    pub amount_withdrawn: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub cliff_time: i64,
    pub is_cancelled: bool,
    pub bump: u8,
    pub seed: u64,
    pub milestone_reached: bool,
    pub velocity_strikes: u8,
    pub last_action_ts: i64,
}

impl StreamAccount {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 8 + 1 + 1 + 8;
}
