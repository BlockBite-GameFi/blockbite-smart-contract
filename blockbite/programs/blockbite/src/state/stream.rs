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
    // ── Week 5 ────────────────────────────────────────
    /// Set to `true` by `set_milestone` when the creator confirms a KPI
    /// has been reached, enabling cliff-to-linear vesting to begin.
    pub milestone_reached:     bool,    //  1
    /// VGPV strike counter.  Increments on each action faster than
    /// `MIN_ACTION_INTERVAL`; resets to 0 after `VELOCITY_RESET_INTERVAL`.
    pub velocity_strikes:      u8,      //  1
    /// Unix timestamp of the last successful `withdraw` action.
    /// Used to compute the inter-action interval for VGPV.
    pub last_action_ts:        i64,     //  8
}

impl StreamAccount {
    // 8  (Anchor discriminator)
    // + 32+32+32+32  (four Pubkeys)
    // + 8+8+8+8+8    (five u64 / i64 amounts & times)
    // + 1+1+8        (is_cancelled, bump, seed)
    // + 1+1+8        (milestone_reached, velocity_strikes, last_action_ts)
    // = 196 bytes total  ← used directly as `space` in the init constraint
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32
        + 8 + 8 + 8 + 8 + 8
        + 1 + 1 + 8
        + 1 + 1 + 8;   // 196
}
