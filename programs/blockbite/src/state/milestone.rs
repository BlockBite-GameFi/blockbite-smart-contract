use anchor_lang::prelude::*;

#[account]
pub struct MilestoneAccount {
    pub campaign:         Pubkey,           // 32  (parent campaign)
    pub recipient:        Pubkey,           // 32  (who can claim)
    pub description_hash: [u8; 32],         // 32  (IPFS/content hash of task)
    pub game_authority:   Pubkey,           // 32  (game server signing key)
    pub token_amount:     u64,              //  8  (reward amount)
    pub target_level:     u8,               //  1  (required level to unlock, 1-30)
    pub achieved_level:   u8,               //  1  (level achieved, set by verify_game)
    pub difficulty:       u8,               //  1  (1=easy, 2=medium, 3=hard)
    pub is_verified:      bool,             //  1
    pub is_claimed:       bool,             //  1  (idempotency guard for claim_milestone)
    pub bump:             u8,               //  1
}

impl MilestoneAccount {
    // 8   (discriminator)
    // + 32  (campaign)
    // + 32  (recipient)
    // + 32  (description_hash)
    // + 32  (game_authority)
    // + 8   (token_amount)
    // + 1   (target_level)
    // + 1   (achieved_level)
    // + 1   (difficulty)
    // + 1   (is_verified)
    // + 1   (is_claimed)
    // + 1   (bump)
    // = 150 bytes
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 1 + 1 + 1 + 1 + 1 + 1; // 150
}
