use anchor_lang::prelude::*;

#[account]
pub struct MilestoneAccount {
    pub campaign:         Pubkey,           // 32  (parent campaign)
    pub recipient:        Pubkey,           // 32  (who can claim)
    pub description_hash: [u8; 32],         // 32  (IPFS/content hash of task)
    pub game_program_id:  Pubkey,           // 32  (game program for game verification)
    pub token_amount:     u64,              //  8  (reward amount)
    pub is_verified:      bool,             //  1
    pub proof_hash:       [u8; 32],         // 32  (submitted proof hash)
    pub proof_submitted:  bool,             //  1  (idempotency guard for submit_proof)
    pub is_claimed:       bool,             //  1  (idempotency guard for claim_milestone)
    pub bump:             u8,               //  1
}

impl MilestoneAccount {
    // 8   (discriminator)
    // + 32  (campaign)
    // + 32  (recipient)
    // + 32  (description_hash)
    // + 32  (game_program_id)
    // + 8   (token_amount)
    // + 1   (is_verified)
    // + 32  (proof_hash)
    // + 1   (proof_submitted)
    // + 1   (is_claimed)
    // + 1   (bump)
    // = 180 bytes
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 1 + 32 + 1 + 1 + 1; // 180
}
