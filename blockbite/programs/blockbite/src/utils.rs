use crate::state::StreamAccount;

// === Hybrid Unlock: Cliff + Milestone (Week 5) ===
// If cliff_time > 0 AND milestone_reached: cliff then linear vesting
// If cliff_time > 0 AND !milestone_reached: 0% unlocked
// If cliff_time = 0: pure linear (Week 4 backward compat)

pub fn calculate_unlocked(stream: &StreamAccount, current_time: i64) -> u64 {
    // Case 1: No cliff → pure linear (Week 4)
    if stream.cliff_time == 0 {
        if current_time < stream.start_time {
            return 0;
        }
        if current_time >= stream.end_time {
            return stream.total_amount;
        }
        let elapsed = (current_time - stream.start_time) as u128;
        let duration = (stream.end_time - stream.start_time) as u128;
        return ((stream.total_amount as u128)
            .checked_mul(elapsed)
            .unwrap()
            .checked_div(duration)
            .unwrap()) as u64;
    }

    // Case 2: Cliff set but milestone NOT reached → 0%
    if !stream.milestone_reached {
        return 0;
    }

    // Case 3: Cliff + milestone reached → linear vesting from cliff to end
    if current_time < stream.cliff_time {
        return 0;
    }
    if current_time >= stream.end_time {
        return stream.total_amount;
    }

    let elapsed = (current_time - stream.cliff_time) as u128;
    let duration = (stream.end_time - stream.cliff_time) as u128;
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
            velocity_strikes: 0,
            last_action_ts: 0,
        }
    }

    // ── Week 4: Linear Vesting Tests (cliff_time = 0) ──

    #[test]
    fn test_unlock_at_0_percent() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, false);
        assert_eq!(calculate_unlocked(&stream, 1000), 0);
    }

    #[test]
    fn test_unlock_at_25_percent() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, false);
        assert_eq!(calculate_unlocked(&stream, 1250), 250_000);
    }

    #[test]
    fn test_unlock_at_50_percent() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, false);
        assert_eq!(calculate_unlocked(&stream, 1500), 500_000);
    }

    #[test]
    fn test_unlock_at_100_percent() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, false);
        assert_eq!(calculate_unlocked(&stream, 2000), 1_000_000);
    }

    #[test]
    fn test_unlock_before_start() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, false);
        assert_eq!(calculate_unlocked(&stream, 500), 0);
    }

    #[test]
    fn test_unlock_past_end() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, false);
        assert_eq!(calculate_unlocked(&stream, 3000), 1_000_000);
    }

    // ── Week 5: Cliff + Milestone → Linear After Cliff ──

    #[test]
    fn test_cliff_before_milestone_false() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500, false);
        assert_eq!(calculate_unlocked(&stream, 1400), 0);
    }

    #[test]
    fn test_cliff_at_exact_milestone_false() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500, false);
        assert_eq!(calculate_unlocked(&stream, 1500), 0);
    }

    #[test]
    fn test_cliff_after_milestone_false() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500, false);
        assert_eq!(calculate_unlocked(&stream, 1800), 0);
    }

    #[test]
    fn test_cliff_at_exact_milestone_reached() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500, true);
        assert_eq!(calculate_unlocked(&stream, 1500), 0);
    }

    #[test]
    fn test_cliff_25_percent_after_milestone() {
        // cliff=1500, end=2000, duration=500
        // at 1625: elapsed=125, 125/500 = 25%
        let stream = make_stream(1_000_000, 1000, 2000, 1500, true);
        assert_eq!(calculate_unlocked(&stream, 1625), 250_000);
    }

    #[test]
    fn test_cliff_50_percent_after_milestone() {
        // at 1750: elapsed=250, 250/500 = 50%
        let stream = make_stream(1_000_000, 1000, 2000, 1500, true);
        assert_eq!(calculate_unlocked(&stream, 1750), 500_000);
    }

    #[test]
    fn test_cliff_100_percent_after_milestone() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500, true);
        assert_eq!(calculate_unlocked(&stream, 2000), 1_000_000);
    }

    #[test]
    fn test_cliff_past_end_after_milestone() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500, true);
        assert_eq!(calculate_unlocked(&stream, 3000), 1_000_000);
    }

    #[test]
    fn test_cliff_zero_uses_linear() {
        let stream = make_stream(1_000_000, 1000, 2000, 0, false);
        assert_eq!(calculate_unlocked(&stream, 1500), 500_000);
    }
}
