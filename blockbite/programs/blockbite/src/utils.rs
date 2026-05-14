use crate::state::StreamAccount;
use anchor_lang::prelude::Pubkey;

pub fn calculate_unlocked(stream: &StreamAccount, current_time: i64) -> u64 {
    if current_time < stream.start_time {
        return 0;
    }
    if stream.cliff_time > 0 && current_time < stream.cliff_time {
        return 0;
    }
    if current_time >= stream.end_time {
        return stream.total_amount;
    }

    let elapsed = (current_time - stream.start_time) as u128;
    let duration = (stream.end_time - stream.start_time) as u128;
    ((stream.total_amount as u128)
        .checked_mul(elapsed)
        .unwrap()
        .checked_div(duration)
        .unwrap()) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_stream(
        total_amount: u64,
        start_time: i64,
        end_time: i64,
        cliff_time: i64,
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
        }
    }

    #[test]
    fn test_unlock_at_0_percent() {
        let stream = make_stream(1_000_000, 1000, 2000, 0);
        assert_eq!(calculate_unlocked(&stream, 1000), 0);
    }

    #[test]
    fn test_unlock_at_25_percent() {
        let stream = make_stream(1_000_000, 1000, 2000, 0);
        assert_eq!(calculate_unlocked(&stream, 1250), 250_000);
    }

    #[test]
    fn test_unlock_at_50_percent() {
        let stream = make_stream(1_000_000, 1000, 2000, 0);
        assert_eq!(calculate_unlocked(&stream, 1500), 500_000);
    }

    #[test]
    fn test_unlock_at_100_percent() {
        let stream = make_stream(1_000_000, 1000, 2000, 0);
        assert_eq!(calculate_unlocked(&stream, 2000), 1_000_000);
    }

    #[test]
    fn test_unlock_before_start() {
        let stream = make_stream(1_000_000, 1000, 2000, 0);
        assert_eq!(calculate_unlocked(&stream, 500), 0);
    }

    #[test]
    fn test_unlock_before_cliff() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500);
        assert_eq!(calculate_unlocked(&stream, 1499), 0);
    }

    #[test]
    fn test_unlock_after_cliff() {
        let stream = make_stream(1_000_000, 1000, 2000, 1500);
        assert_eq!(calculate_unlocked(&stream, 1500), 500_000);
    }

    #[test]
    fn test_unlock_past_end() {
        let stream = make_stream(1_000_000, 1000, 2000, 0);
        assert_eq!(calculate_unlocked(&stream, 3000), 1_000_000);
    }
}
