use crate::state::StreamAccount;
use crate::utils::calculate_unlocked;
use anchor_lang::prelude::Pubkey;

fn make_stream(
    total_amount: u64,
    start_time: i64,
    end_time: i64,
    cliff_time: i64,
    amount_withdrawn: u64,
    milestone_enabled: bool,
    milestone_reached: bool,
) -> StreamAccount {
    StreamAccount {
        creator: Pubkey::new_unique(),
        recipient: Pubkey::new_unique(),
        mint: Pubkey::new_unique(),
        escrow_token_account: Pubkey::new_unique(),
        total_amount,
        amount_withdrawn,
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

#[test]
fn test_cancel_at_0_percent() {
    let stream = make_stream(1_000_000, 1000, 2000, 0, 0, false, false);
    let unlocked = calculate_unlocked(&stream, 1000);
    let recipient_due = unlocked.saturating_sub(stream.amount_withdrawn);
    let creator_due = stream.total_amount.saturating_sub(stream.amount_withdrawn).saturating_sub(recipient_due);
    assert_eq!(recipient_due, 0);
    assert_eq!(creator_due, 1_000_000);
}

#[test]
fn test_cancel_at_25_percent() {
    let stream = make_stream(1_000_000, 1000, 2000, 0, 0, false, false);
    let unlocked = calculate_unlocked(&stream, 1250);
    let recipient_due = unlocked.saturating_sub(stream.amount_withdrawn);
    let creator_due = stream.total_amount.saturating_sub(stream.amount_withdrawn).saturating_sub(recipient_due);
    assert_eq!(recipient_due, 250_000);
    assert_eq!(creator_due, 750_000);
}

#[test]
fn test_cancel_at_50_percent() {
    let stream = make_stream(1_000_000, 1000, 2000, 0, 0, false, false);
    let unlocked = calculate_unlocked(&stream, 1500);
    let recipient_due = unlocked.saturating_sub(stream.amount_withdrawn);
    let creator_due = stream.total_amount.saturating_sub(stream.amount_withdrawn).saturating_sub(recipient_due);
    assert_eq!(recipient_due, 500_000);
    assert_eq!(creator_due, 500_000);
}

#[test]
fn test_cancel_at_100_percent() {
    let stream = make_stream(1_000_000, 1000, 2000, 0, 0, false, false);
    let unlocked = calculate_unlocked(&stream, 2000);
    let recipient_due = unlocked.saturating_sub(stream.amount_withdrawn);
    let creator_due = stream.total_amount.saturating_sub(stream.amount_withdrawn).saturating_sub(recipient_due);
    assert_eq!(recipient_due, 1_000_000);
    assert_eq!(creator_due, 0);
}

#[test]
fn test_cancel_after_partial_withdraw() {
    let stream = make_stream(1_000_000, 1000, 2000, 0, 250_000, false, false);
    let unlocked = calculate_unlocked(&stream, 1500);
    let recipient_due = unlocked.saturating_sub(stream.amount_withdrawn);
    let creator_due = stream.total_amount.saturating_sub(stream.amount_withdrawn).saturating_sub(recipient_due);
    assert_eq!(unlocked, 500_000);
    assert_eq!(recipient_due, 250_000);
    assert_eq!(creator_due, 500_000);
}

#[test]
fn test_cancel_before_cliff() {
    let stream = make_stream(1_000_000, 1000, 2000, 1500, 0, false, false);
    let unlocked = calculate_unlocked(&stream, 1250);
    let recipient_due = unlocked.saturating_sub(stream.amount_withdrawn);
    let creator_due = stream.total_amount.saturating_sub(stream.amount_withdrawn).saturating_sub(recipient_due);
    assert_eq!(unlocked, 0);
    assert_eq!(recipient_due, 0);
    assert_eq!(creator_due, 1_000_000);
}

#[test]
fn test_cancel_after_cliff_linear() {
    let stream = make_stream(1_000_000, 1000, 2000, 1500, 0, false, false);
    let unlocked = calculate_unlocked(&stream, 1750);
    let recipient_due = unlocked.saturating_sub(stream.amount_withdrawn);
    let creator_due = stream.total_amount.saturating_sub(stream.amount_withdrawn).saturating_sub(recipient_due);
    assert_eq!(unlocked, 500_000);
    assert_eq!(recipient_due, 500_000);
    assert_eq!(creator_due, 500_000);
}

#[test]
fn test_cancel_sum_equals_total() {
    for elapsed_pct in [0, 10, 25, 50, 75, 90, 100, 150] {
        let current_time = 1000 + (1000 * elapsed_pct / 100);
        let stream = make_stream(1_000_000, 1000, 2000, 0, 0, false, false);
        let unlocked = calculate_unlocked(&stream, current_time);
        let recipient_due = unlocked.saturating_sub(stream.amount_withdrawn);
        let creator_due = stream.total_amount.saturating_sub(stream.amount_withdrawn).saturating_sub(recipient_due);
        assert_eq!(
            recipient_due + creator_due,
            stream.total_amount,
            "Sum mismatch at {}% elapsed",
            elapsed_pct
        );
    }
}
