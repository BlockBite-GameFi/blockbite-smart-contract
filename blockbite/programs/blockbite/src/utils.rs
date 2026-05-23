use crate::state::StreamAccount;

// === Independent Vesting Gates ===
// 1. Linear (cliff_time = 0, milestone_enabled = false): pure time-based
// 2. Cliff (cliff_time > 0): 0% before cliff_date, then linear from cliff_date
// 3. Milestone (milestone_enabled = true): 0% until creator calls set_milestone
// 4. Cliff + Milestone: both gates must pass, then linear from max(cliff, milestone_ts)

pub fn calculate_unlocked(stream: &StreamAccount, current_time: i64) -> u64 {
    // Gate 1: Cliff — zero tokens before cliff_date
    if stream.cliff_time > 0 && current_time < stream.cliff_time {
        return 0;
    }

    // Gate 2: Milestone — zero tokens until milestone is reached
    if stream.milestone_enabled && !stream.milestone_reached {
        return 0;
    }

    // Before stream start
    if current_time < stream.start_time {
        return 0;
    }

    // Fully vested
    if current_time >= stream.end_time {
        return stream.total_amount;
    }

    // Linear vesting from the effective start (cliff or start_time)
    let effective_start = if stream.cliff_time > 0 {
        stream.cliff_time
    } else {
        stream.start_time
    };

    let elapsed = (current_time - effective_start) as u128;
    let duration = (stream.end_time - effective_start) as u128;
    ((stream.total_amount as u128)
        .checked_mul(elapsed)
        .unwrap()
        .checked_div(duration)
        .unwrap()) as u64
}

// === Tests ===

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::Pubkey;

    fn make_stream(
        total_amount: u64,
        start_time: i64,
        end_time: i64,
        cliff_time: i64,
        milestone_enabled: bool,
        milestone_reached: bool,
    ) -> StreamAccount {
        StreamAccount {
            creator: Pubkey::new_unique(),
            recipient: Pubkey::new_unique(),
            mint: Pubkey::new_unique(),
            escrow_token_account: Pubkey::new_unique(),
            total_amount,
            amount_withdrawn: 0,
            start_time,
            end_time,
            cliff_time,
            is_cancelled: false,
            bump: 0,
            seed: 0,
            milestone_reached,
            milestone_enabled,
        }
    }

    // ── Pure Linear Vesting (cliff_time = 0, milestone_enabled = false) ──

    #[test]
    fn test_linear_at_0_percent() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, false, false);
        assert_eq!(calculate_unlocked(&stream, 1000), 0);
    }

    #[test]
    fn test_linear_at_25_percent() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, false, false);
        assert_eq!(calculate_unlocked(&stream, 1250), 250_000);
    }

    #[test]
    fn test_linear_at_50_percent() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, false, false);
        assert_eq!(calculate_unlocked(&stream, 1500), 500_000);
    }

    #[test]
    fn test_linear_at_100_percent() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, false, false);
        assert_eq!(calculate_unlocked(&stream, 2000), 1_000_000);
    }

    #[test]
    fn test_linear_before_start() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, false, false);
        assert_eq!(calculate_unlocked(&stream, 500), 0);
    }

    #[test]
    fn test_linear_past_end() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, false, false);
        assert_eq!(calculate_unlocked(&stream, 3000), 1_000_000);
    }

    // ── Cliff Vesting (cliff_time > 0, milestone_enabled = false) ──

    #[test]
    fn test_cliff_before_cliff_date() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500, false, false);
        assert_eq!(calculate_unlocked(&stream, 1400), 0);
    }

    #[test]
    fn test_cliff_at_exact_cliff_date() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500, false, false);
        assert_eq!(calculate_unlocked(&stream, 1500), 0);
    }

    #[test]
    fn test_cliff_25_percent_after_cliff() {
        // cliff=1500, end=2000, duration=500
        // at 1625: elapsed=125, 125/500 = 25%
        let stream = make_stream(1_000_000, 1000, 2000, 1500, false, false);
        assert_eq!(calculate_unlocked(&stream, 1625), 250_000);
    }

    #[test]
    fn test_cliff_50_percent_after_cliff() {
        // at 1750: elapsed=250, 250/500 = 50%
        let stream = make_stream(1_000_000, 1000, 2000, 1500, false, false);
        assert_eq!(calculate_unlocked(&stream, 1750), 500_000);
    }

    #[test]
    fn test_cliff_100_percent() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500, false, false);
        assert_eq!(calculate_unlocked(&stream, 2000), 1_000_000);
    }

    #[test]
    fn test_cliff_past_end() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500, false, false);
        assert_eq!(calculate_unlocked(&stream, 3000), 1_000_000);
    }

    // ── Milestone Vesting (cliff_time = 0, milestone_enabled = true) ──

    #[test]
    fn test_milestone_not_reached_zero() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, true, false);
        assert_eq!(calculate_unlocked(&stream, 1500), 0);
    }

    #[test]
    fn test_milestone_reached_linear() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, true, true);
        assert_eq!(calculate_unlocked(&stream, 1500), 500_000);
    }

    #[test]
    fn test_milestone_reached_past_end() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, true, true);
        assert_eq!(calculate_unlocked(&stream, 3000), 1_000_000);
    }

    // ── Cliff + Milestone Combined ──

    #[test]
    fn test_cliff_and_milestone_both_block() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500, true, false);
        assert_eq!(calculate_unlocked(&stream, 1800), 0);
    }

    #[test]
    fn test_cliff_passed_milestone_not_reached() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500, true, false);
        assert_eq!(calculate_unlocked(&stream, 1600), 0);
    }

    #[test]
    fn test_cliff_passed_milestone_reached() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500, true, true);
        assert_eq!(calculate_unlocked(&stream, 1750), 500_000);
    }

    #[test]
    fn test_milestone_reached_before_cliff() {
        // Milestone reached but cliff not yet → still 0%
        let stream = make_stream(1_000_000, 1000, 2000, 1500, true, true);
        assert_eq!(calculate_unlocked(&stream, 1400), 0);
    }
}
