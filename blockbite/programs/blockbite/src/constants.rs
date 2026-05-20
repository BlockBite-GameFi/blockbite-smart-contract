// ── VGPV: Velocity Guard Penalty Valve ───────────────────────────────────────
/// Minimum seconds between two withdraw/cancel actions before a strike is issued.
/// Actions faster than this are treated as suspicious bot behaviour.
pub const MIN_ACTION_INTERVAL: i64 = 2;

/// Maximum strike count a stream may accumulate before the address is banned.
/// Once `velocity_strikes >= MAX_VELOCITY_STRIKES` every action is rejected.
pub const MAX_VELOCITY_STRIKES: u8 = 3;

/// After this many seconds of inactivity (since `last_action_ts`) the strike
/// counter resets to zero.  One hour of cooling-down clears bot history so a
/// legitimate user is never permanently locked out.
pub const VELOCITY_RESET_INTERVAL: i64 = 3_600; // 1 hour

/// Minimum claimable amount (in token base units) required to execute a
/// withdrawal.  Rejects dust claims that bots use to probe stream state.
pub const MIN_CLAIM_AMOUNT: u64 = 1_000;

// ── Developer Fee ─────────────────────────────────────────────────────────────
/// Basis points (1 bps = 0.01 %) charged by the protocol on every
/// `create_stream` call.  100 bps = 1 % of `total_amount`.
/// The fee is transferred from the creator's token account to the
/// `developer_token_account` supplied in the instruction.
pub const DEV_FEE_BPS: u64 = 100; // 1 %
