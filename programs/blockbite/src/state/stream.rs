use anchor_lang::prelude::*;

#[account]
pub struct StreamAccount {
    pub creator:               Pubkey,  // 32
    pub recipient:             Pubkey,  // 32
    pub mint:                  Pubkey,  // 32
    pub escrow_token_account:  Pubkey,  // 32
    pub total_amount:          u64,     //  8
    pub amount_withdrawn:      u64,     //  8
    pub start_time:            i64,     //  8
    pub end_time:              i64,     //  8
    pub cliff_time:            i64,     //  8
    pub is_cancelled:          bool,    //  1
    pub bump:                  u8,      //  1
    pub seed:                  u64,     //  8
    /// When `true`, tokens are gated behind a milestone condition.
    /// Set by `set_milestone`. Only the creator can call it.
    pub milestone_reached:     bool,    //  1
    /// When `true`, milestone gate is active for this stream.
    /// Auto-set to `true` when `cliff_time > 0` on creation.
    /// When `false`, milestone gate is bypassed (pure linear).
    pub milestone_enabled:     bool,    //  1
    /// Human-readable stream label (up to 31 UTF-8 chars + null terminator).
    pub name:                  [u8; 32],// 32
}

impl StreamAccount {
    // 8  (Anchor discriminator)
    // + 32+32+32+32  (four Pubkeys)
    // + 8+8+8+8+8    (five u64 / i64 amounts & times)
    // + 1+1+8        (is_cancelled, bump, seed)
    // + 1+1          (milestone_reached, milestone_enabled)
    // + 32           (name)
    // = 220 bytes total
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32
        + 8 + 8 + 8 + 8 + 8
        + 1 + 1 + 8
        + 1 + 1
        + 32;   // 220
}
