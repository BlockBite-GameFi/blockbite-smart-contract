use anchor_lang::prelude::*;
use crate::constants::MAX_SIGNERS;

#[account]
pub struct MilestoneAccount {
    pub campaign:         Pubkey,           // 32  (parent campaign)
    pub recipient:        Pubkey,           // 32  (who can claim)
    pub description_hash: [u8; 32],         // 32  (IPFS/content hash of task)
    pub verification_type: u8,              //  1  (0=Oracle, 1=Game, 2=Multisig)
    pub oracle_pubkey:    Pubkey,           // 32  (trusted oracle for oracle verification)
    pub signer_count:     u8,               //  1  (required signers for multisig)
    pub signers:          [Pubkey; MAX_SIGNERS], // 160 (authorized multisig signers)
    pub game_program_id:  Pubkey,           // 32  (game program for game verification)
    pub token_amount:     u64,              //  8  (reward amount)
    pub is_verified:      bool,             //  1
    pub proof_hash:       [u8; 32],         // 32  (submitted proof hash)
    pub bump:             u8,               //  1
}

impl MilestoneAccount {
    // 8   (discriminator)
    // + 32  (campaign)
    // + 32  (recipient)
    // + 32  (description_hash)
    // + 1   (verification_type)
    // + 32  (oracle_pubkey)
    // + 1   (signer_count)
    // + 160 (signers: 5 * 32)
    // + 32  (game_program_id)
    // + 8   (token_amount)
    // + 1   (is_verified)
    // + 32  (proof_hash)
    // + 1   (bump)
    // = 372 bytes
    pub const LEN: usize = 8 + 32 + 32 + 32 + 1 + 32 + 1 + 160 + 32 + 8 + 1 + 32 + 1; // 372
}
