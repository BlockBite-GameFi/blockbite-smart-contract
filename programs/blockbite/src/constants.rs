// ── Stream Vesting ────────────────────────────────────────────────────────────

/// Protocol fee on `create_stream` — 0.9% of the stream's `total_amount`.
/// Charged on top of the stream amount: the creator pays `total_amount + fee`,
/// the recipient still receives the full `total_amount`.
pub const STREAM_FEE_BPS: u64 = 90;

/// Additional protocol fee on `create_milestone` when the founder opts in to
/// a game authority (anti-bot oracle). 0.1% of the milestone's `token_amount`.
/// Combined with `STREAM_FEE_BPS`, max total take rate is 1.0%.
/// Charged from the campaign escrow at `create_milestone` time; the founder
/// must budget for it in `create_campaign.total_budget`.
pub const GAME_VERIFICATION_FEE_BPS: u64 = 10;

/// Basis-points denominator. 10_000 bps == 100%.
pub const FEE_BASIS_POINTS_DENOMINATOR: u64 = 10_000;

/// Dust filter: reject withdrawals below this.
pub const MIN_CLAIM_AMOUNT: u64 = 1_000;
pub const MIN_ACTION_INTERVAL: i64 = 2;
pub const MAX_VELOCITY_STRIKES: u8 = 3;
pub const VELOCITY_RESET_INTERVAL: i64 = 3_600;

// ── Game Levels ──────────────────────────────────────────────────────────────

pub const MIN_LEVEL: u8 = 1;
pub const MAX_LEVEL: u8 = 30;

pub const DIFFICULTY_EASY: u8 = 1;
pub const DIFFICULTY_MEDIUM: u8 = 2;
pub const DIFFICULTY_HARD: u8 = 3;

pub const EASY_MAX_LEVEL: u8 = 5;
pub const MEDIUM_MAX_LEVEL: u8 = 15;
