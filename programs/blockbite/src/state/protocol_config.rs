use anchor_lang::prelude::*;

/// Protocol-wide configuration. Single PDA, init once by the deployer.
///
/// Stores the canonical treasury wallet that owns the per-mint treasury ATAs.
/// `create_stream` charges a 0.9% fee and routes it to the treasury ATA for
/// the stream's mint. `create_milestone` charges no protocol fee — game
/// verification is free.
///
/// PDA seeds: `["protocol_config"]`.
#[account]
pub struct ProtocolConfig {
    /// Wallet authorised to update `treasury` (single-signer for now; a
    /// multisig can sit in front of this pubkey for production governance).
    pub admin:    Pubkey,  // 32
    /// Wallet that owns the per-mint treasury ATAs. Fees are paid into the
    /// ATA derived from `(treasury, mint)` for each stream/milestone mint.
    pub treasury: Pubkey,  // 32
    pub bump:     u8,      //  1
}

impl ProtocolConfig {
    // 8   (Anchor discriminator)
    // + 32 (admin)
    // + 32 (treasury)
    // + 1  (bump)
    // = 73 bytes
    pub const LEN: usize = 8 + 32 + 32 + 1; // 73
}
