use anchor_lang::prelude::*;

/// Protocol-wide configuration. Single PDA, init once by the deployer.
///
/// Stores the canonical treasury wallet that owns the per-mint treasury ATAs.
/// Both `create_stream` (0.9% fee) and `create_milestone` (0.1% fee, when a
/// game authority is set) transfer their fee to the treasury ATA for the
/// stream/milestone's mint.
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
