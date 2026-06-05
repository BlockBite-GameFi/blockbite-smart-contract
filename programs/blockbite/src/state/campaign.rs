use anchor_lang::prelude::*;

#[account]
pub struct CampaignAccount {
    pub founder:          Pubkey,    // 32
    pub title_hash:       [u8; 32],  // 32  (IPFS/content hash of campaign details)
    pub total_budget:     u64,       //  8
    pub allocated_amount: u64,       //  8  (sum of all milestone token_amounts)
    pub milestone_count:  u8,        //  1
    pub bump:             u8,        //  1
}

impl CampaignAccount {
    // 8  (discriminator)
    // + 32 (founder)
    // + 32 (title_hash)
    // + 8  (total_budget)
    // + 8  (allocated_amount)
    // + 1  (milestone_count)
    // + 1  (bump)
    // = 90 bytes
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1; // 90
}
