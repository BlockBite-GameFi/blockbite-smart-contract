// =============================================================================
// tests_logic.rs — Unit tests for the pure business-logic functions extracted
// from each instruction handler. These cover the validation, state mutation,
// and computation paths that would otherwise only run inside the BPF VM.
// =============================================================================

use anchor_lang::prelude::Pubkey;
use anchor_lang::error::Error as AnchorError;

use crate::state::{CampaignAccount, MilestoneAccount, StreamAccount};
use crate::errors::ErrorCode;
use crate::instructions::{
    cancel::compute_cancel,
    claim_milestone::mark_milestone_claimed,
    close_stream::{compute_close_dust, validate_closeable},
    create_campaign::init_campaign,
    create_milestone::init_milestone,
    create_stream::{compute_stream_fee, init_stream},
    set_milestone::set_milestone_reached,
    verify_game::verify_game_impl,
    withdraw::{build_stream_signer_seeds, compute_withdraw},
};

// ── Helpers ─────────────────────────────────────────────────────────────────

fn empty_stream() -> StreamAccount {
    StreamAccount {
        creator:              Pubkey::new_unique(),
        recipient:            Pubkey::new_unique(),
        mint:                 Pubkey::new_unique(),
        escrow_token_account: Pubkey::new_unique(),
        total_amount:         0,
        amount_withdrawn:     0,
        start_time:           0,
        end_time:             0,
        cliff_time:           0,
        is_cancelled:         false,
        bump:                 0,
        seed:                 0,
        milestone_reached:    false,
        milestone_enabled:    false,
        name:                 [0u8; 32],
    }
}

fn empty_campaign() -> CampaignAccount {
    CampaignAccount {
        founder:          Pubkey::new_unique(),
        title_hash:       [0u8; 32],
        total_budget:     0,
        allocated_amount: 0,
        milestone_count:  0,
        bump:             0,
    }
}

fn empty_milestone() -> MilestoneAccount {
    MilestoneAccount {
        campaign:         Pubkey::new_unique(),
        recipient:        Pubkey::new_unique(),
        description_hash: [0u8; 32],
        game_authority:   Pubkey::new_unique(),
        token_amount:     0,
        target_level:     10,
        achieved_level:   0,
        difficulty:       2,
        is_verified:      false,
        is_claimed:       false,
        bump:             0,
    }
}

/// Anchor prepends the error_code_offset (6000) to the enum discriminant.
const ANCHOR_ERROR_OFFSET: u32 = 6000;

fn err_code(err: AnchorError) -> u32 {
    match err {
        AnchorError::AnchorError(ae) => ae.error_code_number,
        _ => 0,
    }
}

fn err_for(code: ErrorCode) -> u32 {
    code as u32 + ANCHOR_ERROR_OFFSET
}

// =============================================================================
// create_stream.rs :: init_stream
// =============================================================================

#[test]
fn test_init_stream_happy_path() {
    let mut s = empty_stream();
    let creator = Pubkey::new_unique();
    let recipient = Pubkey::new_unique();
    let mint = Pubkey::new_unique();
    let escrow = Pubkey::new_unique();

    let fee = init_stream(
        &mut s,
        creator, recipient, mint, escrow,
        1_000_000, 1000, 2000, 0,
        42, false, 254, [0u8; 32],
    ).unwrap();

    assert_eq!(s.creator, creator);
    assert_eq!(s.recipient, recipient);
    assert_eq!(s.mint, mint);
    assert_eq!(s.escrow_token_account, escrow);
    assert_eq!(s.total_amount, 1_000_000);
    assert_eq!(s.amount_withdrawn, 0);
    assert_eq!(s.start_time, 1000);
    assert_eq!(s.end_time, 2000);
    assert_eq!(s.cliff_time, 0);
    assert!(!s.is_cancelled);
    assert_eq!(s.bump, 254);
    assert_eq!(s.seed, 42);
    assert!(!s.milestone_reached);
    assert!(!s.milestone_enabled);

    // 0.9% of 1_000_000 = 9_000
    assert_eq!(fee, 9_000);
}

#[test]
fn test_init_stream_with_cliff_and_milestone() {
    let mut s = empty_stream();
    let creator = Pubkey::new_unique();
    let recipient = Pubkey::new_unique();

    init_stream(
        &mut s, creator, recipient, Pubkey::new_unique(), Pubkey::new_unique(),
        100, 1000, 3000, 1500, 0, true, 0, [0u8; 32],
    ).unwrap();

    assert_eq!(s.cliff_time, 1500);
    assert!(s.milestone_enabled);
}

#[test]
fn test_init_stream_rejects_zero_amount() {
    let mut s = empty_stream();
    let err = init_stream(
        &mut s, Pubkey::new_unique(), Pubkey::new_unique(),
        Pubkey::new_unique(), Pubkey::new_unique(),
        0, 1000, 2000, 0, 0, false, 0, [0u8; 32],
    ).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::InvalidAmount));
}

#[test]
fn test_init_stream_rejects_end_le_start() {
    let mut s = empty_stream();
    let err = init_stream(
        &mut s, Pubkey::new_unique(), Pubkey::new_unique(),
        Pubkey::new_unique(), Pubkey::new_unique(),
        100, 2000, 1000, 0, 0, false, 0, [0u8; 32],
    ).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::InvalidTimestamp));
}

#[test]
fn test_init_stream_rejects_end_eq_start() {
    let mut s = empty_stream();
    let err = init_stream(
        &mut s, Pubkey::new_unique(), Pubkey::new_unique(),
        Pubkey::new_unique(), Pubkey::new_unique(),
        100, 1000, 1000, 0, 0, false, 0, [0u8; 32],
    ).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::InvalidTimestamp));
}

#[test]
fn test_init_stream_rejects_cliff_gt_end() {
    let mut s = empty_stream();
    let err = init_stream(
        &mut s, Pubkey::new_unique(), Pubkey::new_unique(),
        Pubkey::new_unique(), Pubkey::new_unique(),
        100, 1000, 2000, 3000, 0, false, 0, [0u8; 32],
    ).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::InvalidTimestamp));
}

#[test]
fn test_init_stream_allows_cliff_eq_end() {
    let mut s = empty_stream();
    init_stream(
        &mut s, Pubkey::new_unique(), Pubkey::new_unique(),
        Pubkey::new_unique(), Pubkey::new_unique(),
        100, 1000, 2000, 2000, 0, false, 0, [0u8; 32],
    ).unwrap();
}

#[test]
fn test_init_stream_rejects_creator_eq_recipient() {
    let mut s = empty_stream();
    let same = Pubkey::new_unique();
    let err = init_stream(
        &mut s, same, same, Pubkey::new_unique(), Pubkey::new_unique(),
        100, 1000, 2000, 0, 0, false, 0, [0u8; 32],
    ).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::InvalidRecipient));
}

// =============================================================================
// withdraw.rs :: compute_withdraw
// =============================================================================

#[test]
fn test_compute_withdraw_partial() {
    let mut s = empty_stream();
    s.total_amount = 1_000_000;
    s.start_time = 1000;
    s.end_time = 2000;
    let claimable = compute_withdraw(&mut s, 1500).unwrap();
    assert_eq!(claimable, 500_000);
    assert_eq!(s.amount_withdrawn, 500_000);
}

#[test]
fn test_compute_withdraw_full_when_vested() {
    let mut s = empty_stream();
    s.total_amount = 1_000_000;
    s.start_time = 1000;
    s.end_time = 2000;
    let claimable = compute_withdraw(&mut s, 2000).unwrap();
    assert_eq!(claimable, 1_000_000);
    assert_eq!(s.amount_withdrawn, 1_000_000);
}

#[test]
fn test_compute_withdraw_rejects_cancelled() {
    let mut s = empty_stream();
    s.is_cancelled = true;
    let err = compute_withdraw(&mut s, 1500).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::StreamCancelled));
}

#[test]
fn test_compute_withdraw_rejects_before_start() {
    let mut s = empty_stream();
    s.start_time = 1000;
    s.end_time = 2000;
    let err = compute_withdraw(&mut s, 500).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::StreamNotStarted));
}

#[test]
fn test_compute_withdraw_rejects_nothing_claimable() {
    let mut s = empty_stream();
    s.total_amount = 1_000_000;
    s.start_time = 1000;
    s.end_time = 2000;
    s.amount_withdrawn = 500_000;
    let err = compute_withdraw(&mut s, 1500).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::NothingToWithdraw));
}

#[test]
fn test_compute_withdraw_rejects_double_claim() {
    // After a full withdraw, a second call must fail.
    let mut s = empty_stream();
    s.total_amount = 1_000_000;
    s.start_time = 1000;
    s.end_time = 2000;
    let _ = compute_withdraw(&mut s, 2000).unwrap();
    let err = compute_withdraw(&mut s, 2001).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::NothingToWithdraw));
}

// =============================================================================
// cancel.rs :: compute_cancel
// =============================================================================

#[test]
fn test_compute_cancel_midstream_splits_correctly() {
    let mut s = empty_stream();
    s.total_amount = 1_000_000;
    s.start_time = 1000;
    s.end_time = 2000;
    s.amount_withdrawn = 0;

    let payout = compute_cancel(&mut s, 1500).unwrap();
    assert_eq!(payout.recipient_due, 500_000);
    assert_eq!(payout.creator_due, 500_000);
    assert!(s.is_cancelled, "must flip is_cancelled before CPI");
}

#[test]
fn test_compute_cancel_after_partial_withdraw() {
    let mut s = empty_stream();
    s.total_amount = 1_000_000;
    s.start_time = 1000;
    s.end_time = 2000;
    s.amount_withdrawn = 200_000;

    let payout = compute_cancel(&mut s, 1500).unwrap();
    assert_eq!(payout.recipient_due, 300_000);
    assert_eq!(payout.creator_due, 500_000);
}

#[test]
fn test_compute_cancel_rejects_already_cancelled() {
    let mut s = empty_stream();
    s.is_cancelled = true;
    let err = compute_cancel(&mut s, 1500).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::AlreadyCancelled));
}

#[test]
fn test_compute_cancel_rejects_fully_vested() {
    let mut s = empty_stream();
    s.total_amount = 1_000_000;
    s.start_time = 1000;
    s.end_time = 2000;
    let err = compute_cancel(&mut s, 2000).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::FullyVested));
}

#[test]
fn test_compute_cancel_sums_to_remaining() {
    let mut s = empty_stream();
    s.total_amount = 1_000_000;
    s.start_time = 1000;
    s.end_time = 4000;
    s.amount_withdrawn = 100_000;

    let payout = compute_cancel(&mut s, 1500).unwrap();
    assert_eq!(
        payout.recipient_due + payout.creator_due,
        s.total_amount - s.amount_withdrawn,
    );
}

// =============================================================================
// set_milestone.rs :: set_milestone_reached
// =============================================================================

#[test]
fn test_set_milestone_reached_flips_both_flags() {
    let mut s = empty_stream();
    assert!(!s.milestone_reached);
    assert!(!s.milestone_enabled);
    set_milestone_reached(&mut s);
    assert!(s.milestone_reached);
    assert!(s.milestone_enabled);
}

// =============================================================================
// create_campaign.rs :: init_campaign
// =============================================================================

#[test]
fn test_init_campaign_happy_path() {
    let mut c = empty_campaign();
    let founder = Pubkey::new_unique();
    let title = [7u8; 32];
    init_campaign(&mut c, founder, title, 1_000_000, 253).unwrap();
    assert_eq!(c.founder, founder);
    assert_eq!(c.title_hash, title);
    assert_eq!(c.total_budget, 1_000_000);
    assert_eq!(c.allocated_amount, 0);
    assert_eq!(c.milestone_count, 0);
    assert_eq!(c.bump, 253);
}

#[test]
fn test_init_campaign_rejects_zero_budget() {
    let mut c = empty_campaign();
    let err = init_campaign(
        &mut c, Pubkey::new_unique(), [0u8; 32], 0, 0,
    ).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::InvalidAmount));
}

// =============================================================================
// create_milestone.rs :: init_milestone
// =============================================================================

#[test]
fn test_init_milestone_happy_path() {
    let mut c = empty_campaign();
    c.total_budget = 100_000;
    let mut m = empty_milestone();
    let campaign_key = Pubkey::new_unique();
    let recipient = Pubkey::new_unique();
    let game = Pubkey::new_unique();

    init_milestone(
        &mut c, &mut m,
        campaign_key, recipient, [1u8; 32], game,
        10_000, 10, 2, 252,
    ).unwrap();

    assert_eq!(m.campaign, campaign_key);
    assert_eq!(m.recipient, recipient);
    assert_eq!(m.game_authority, game);
    assert_eq!(m.token_amount, 10_000);
    assert_eq!(m.target_level, 10);
    assert_eq!(m.achieved_level, 0);
    assert_eq!(m.difficulty, 2);
    assert!(!m.is_verified);
    assert!(!m.is_claimed);
    assert_eq!(m.bump, 252);

    // No protocol fee on create_milestone — full amount goes to recipient.
    assert_eq!(c.allocated_amount, 10_000);
    assert_eq!(c.milestone_count, 1);
}

#[test]
fn test_init_milestone_rejects_zero_amount() {
    let mut c = empty_campaign();
    let mut m = empty_milestone();
    let err = init_milestone(
        &mut c, &mut m,
        Pubkey::new_unique(), Pubkey::new_unique(), [0u8; 32], Pubkey::new_unique(),
        0, 10, 2, 0,
    ).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::InvalidAmount));
}

#[test]
fn test_init_milestone_rejects_budget_overflow() {
    let mut c = empty_campaign();
    c.total_budget = 10_000;
    let mut m = empty_milestone();
    let err = init_milestone(
        &mut c, &mut m,
        Pubkey::new_unique(), Pubkey::new_unique(), [0u8; 32], Pubkey::new_unique(),
        20_000, 10, 2, 0,
    ).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::InsufficientBudget));
}

#[test]
fn test_init_milestone_rejects_budget_overflow_arithmetic() {
    // Arithmetic overflow path uses checked_add → returns InsufficientBudget
    let mut c = empty_campaign();
    c.total_budget = u64::MAX;
    c.allocated_amount = u64::MAX;
    let mut m = empty_milestone();
    let err = init_milestone(
        &mut c, &mut m,
        Pubkey::new_unique(), Pubkey::new_unique(), [0u8; 32], Pubkey::new_unique(),
        1, 10, 2, 0,
    ).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::InsufficientBudget));
}

#[test]
fn test_init_milestone_rejects_level_zero() {
    // MIN_LEVEL = 1, so target_level = 0 must be rejected with InvalidLevel.
    // Latches the lower bound of the on-chain MAX_LEVEL=30 invariant.
    let mut c = empty_campaign();
    c.total_budget = 100_000;
    let mut m = empty_milestone();
    let err = init_milestone(
        &mut c, &mut m,
        Pubkey::new_unique(), Pubkey::new_unique(), [0u8; 32], Pubkey::new_unique(),
        1_000, 0, 2, 0,
    ).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::InvalidLevel));
}

#[test]
fn test_init_milestone_rejects_level_above_max() {
    // MAX_LEVEL = 30, so target_level = 31 must be rejected with InvalidLevel.
    // Latches the upper bound so a future constants tweak can't silently
    // accept out-of-range levels.
    let mut c = empty_campaign();
    c.total_budget = 100_000;
    let mut m = empty_milestone();
    let err = init_milestone(
        &mut c, &mut m,
        Pubkey::new_unique(), Pubkey::new_unique(), [0u8; 32], Pubkey::new_unique(),
        1_000, 31, 2, 0,
    ).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::InvalidLevel));
}

#[test]
fn test_init_milestone_accumulates_allocated() {
    let mut c = empty_campaign();
    c.total_budget = 100_000;
    let mut m1 = empty_milestone();
    let mut m2 = empty_milestone();

    init_milestone(
        &mut c, &mut m1,
        Pubkey::new_unique(), Pubkey::new_unique(), [0u8; 32], Pubkey::new_unique(),
        30_000, 10, 1, 0,
    ).unwrap();
    init_milestone(
        &mut c, &mut m2,
        Pubkey::new_unique(), Pubkey::new_unique(), [0u8; 32], Pubkey::new_unique(),
        20_000, 15, 2, 0,
    ).unwrap();

    // No fee — full amounts accumulate into allocated_amount.
    assert_eq!(c.allocated_amount, 50_000);
    assert_eq!(c.milestone_count, 2);
}

// =============================================================================
// verify_game.rs :: verify_game_impl
// =============================================================================

#[test]
fn test_verify_game_happy_path() {
    let game = Pubkey::new_unique();
    let mut m = empty_milestone();
    m.game_authority = game;
    m.target_level = 10;
    verify_game_impl(&mut m, game, 10).unwrap();
    assert!(m.is_verified);
    assert_eq!(m.achieved_level, 10);
}

#[test]
fn test_verify_game_rejects_wrong_authority() {
    let game = Pubkey::new_unique();
    let other = Pubkey::new_unique();
    let mut m = empty_milestone();
    m.game_authority = game;
    m.target_level = 10;
    let err = verify_game_impl(&mut m, other, 10).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::InvalidGameAuthority));
}

#[test]
fn test_verify_game_rejects_level_not_reached() {
    let game = Pubkey::new_unique();
    let mut m = empty_milestone();
    m.game_authority = game;
    m.target_level = 15;
    let err = verify_game_impl(&mut m, game, 10).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::LevelNotReached));
}

#[test]
fn test_verify_game_rejects_level_zero() {
    // Latches MIN_LEVEL=1 — game server can never write achieved_level=0.
    // The on-chain check fires BEFORE the LevelNotReached check, so we use
    // a target_level=1 milestone to prove InvalidLevel wins over the
    // "LevelNotReached" path even when both would otherwise apply.
    let game = Pubkey::new_unique();
    let mut m = empty_milestone();
    m.game_authority = game;
    m.target_level = 1;
    let err = verify_game_impl(&mut m, game, 0).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::InvalidLevel));
    assert!(!m.is_verified);
}

#[test]
fn test_verify_game_rejects_level_above_max() {
    // Latches MAX_LEVEL=30 — game server can never write achieved_level=31.
    // The check happens before the level-not-reached branch in verify_game_impl.
    let game = Pubkey::new_unique();
    let mut m = empty_milestone();
    m.game_authority = game;
    m.target_level = 1;
    let err = verify_game_impl(&mut m, game, 31).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::InvalidLevel));
    assert!(!m.is_verified);
}

#[test]
fn test_verify_game_accepts_higher_level() {
    let game = Pubkey::new_unique();
    let mut m = empty_milestone();
    m.game_authority = game;
    m.target_level = 10;
    verify_game_impl(&mut m, game, 20).unwrap();
    assert!(m.is_verified);
    assert_eq!(m.achieved_level, 20);
}

#[test]
fn test_verify_game_rejects_already_verified() {
    let game = Pubkey::new_unique();
    let mut m = empty_milestone();
    m.game_authority = game;
    m.target_level = 10;
    m.is_verified = true;
    let err = verify_game_impl(&mut m, game, 10).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::MilestoneAlreadyVerified));
}

// =============================================================================
// claim_milestone.rs :: mark_milestone_claimed
// =============================================================================

#[test]
fn test_mark_milestone_claimed_sets_flag() {
    let mut m = empty_milestone();
    assert!(!m.is_claimed);
    mark_milestone_claimed(&mut m);
    assert!(m.is_claimed);
}

#[test]
fn test_mark_milestone_claimed_idempotent() {
    // Calling twice is safe — once is_claimed=true, second call is a no-op.
    let mut m = empty_milestone();
    mark_milestone_claimed(&mut m);
    mark_milestone_claimed(&mut m);
    assert!(m.is_claimed);
}

// =============================================================================
// close_stream.rs :: validate_closeable + compute_close_dust
// =============================================================================

#[test]
fn test_validate_closeable_when_cancelled() {
    let mut s = empty_stream();
    s.is_cancelled = true;
    validate_closeable(&s).unwrap();
}

#[test]
fn test_validate_closeable_when_fully_withdrawn() {
    let mut s = empty_stream();
    s.total_amount = 1_000_000;
    s.amount_withdrawn = 1_000_000;
    validate_closeable(&s).unwrap();
}

#[test]
fn test_validate_closeable_rejects_unsettled() {
    let mut s = empty_stream();
    s.total_amount = 1_000_000;
    s.amount_withdrawn = 500_000;
    s.is_cancelled = false;
    let err = validate_closeable(&s).unwrap_err();
    assert_eq!(err_code(err), err_for(ErrorCode::StreamNotSettled));
}

#[test]
fn test_compute_close_dust_cancelled_returns_zero() {
    let mut s = empty_stream();
    s.is_cancelled = true;
    assert_eq!(compute_close_dust(&s, 999), 0);
}

#[test]
fn test_compute_close_dust_uncancelled_returns_escrow_balance() {
    let s = empty_stream();
    assert_eq!(compute_close_dust(&s, 0), 0);
    assert_eq!(compute_close_dust(&s, 1234), 1234);
}

// =============================================================================
// withdraw.rs :: build_stream_signer_seeds
// =============================================================================

#[test]
fn test_build_stream_signer_seeds_layout() {
    let creator   = Pubkey::new_unique();
    let recipient = Pubkey::new_unique();
    let seed_bytes: [u8; 8] = 42u64.to_le_bytes();
    let bump_byte:  u8     = 254;

    let seeds = build_stream_signer_seeds(&creator, &recipient, &seed_bytes, &bump_byte);

    assert_eq!(seeds.len(), 5, "must be 5 seeds: tag, creator, recipient, seed, bump");
    assert_eq!(seeds[0], b"stream", "tag must be the literal 'stream'");
    assert_eq!(seeds[1], creator.as_ref(), "creator pubkey bytes");
    assert_eq!(seeds[2], recipient.as_ref(), "recipient pubkey bytes");
    assert_eq!(seeds[3], &seed_bytes[..], "LE-encoded u64 seed");
    assert_eq!(seeds[4], &[bump_byte][..], "bump byte");
}

#[test]
fn test_build_stream_signer_seeds_zero_seed_and_bump() {
    let creator   = Pubkey::default();
    let recipient = Pubkey::default();
    let seed_bytes: [u8; 8] = 0u64.to_le_bytes();
    let bump_byte:  u8     = 0;

    let seeds = build_stream_signer_seeds(&creator, &recipient, &seed_bytes, &bump_byte);

    assert_eq!(seeds[0], b"stream");
    assert_eq!(seeds[1], [0u8; 32]);
    assert_eq!(seeds[2], [0u8; 32]);
    assert_eq!(seeds[3], &[0u8; 8][..]);
    assert_eq!(seeds[4], &[0u8][..]);
}

// =============================================================================
// Fee math (create_stream + create_milestone)
// =============================================================================

#[test]
fn test_stream_fee_0_9_percent() {
    // Exact multiple of 10_000 — clean division.
    assert_eq!(compute_stream_fee(1_000_000).unwrap(), 9_000);
    assert_eq!(compute_stream_fee(10_000).unwrap(), 90);
    assert_eq!(compute_stream_fee(100_000).unwrap(), 900);
}

#[test]
fn test_stream_fee_rounds_down() {
    // Integer division truncates the remainder, so the protocol never overcharges.
    assert_eq!(compute_stream_fee(1_001).unwrap(), 9);
    assert_eq!(compute_stream_fee(99).unwrap(), 0);
    assert_eq!(compute_stream_fee(10).unwrap(), 0);
}

#[test]
fn test_stream_fee_zero_for_tiny_amounts() {
    assert_eq!(compute_stream_fee(0).unwrap(), 0);
    assert_eq!(compute_stream_fee(1).unwrap(), 0);
    assert_eq!(compute_stream_fee(111).unwrap(), 0);
}

#[test]
fn test_stream_fee_max_value() {
    // u64::MAX * 90 / 10_000 must not overflow. The u128 intermediate handles it.
    let fee = compute_stream_fee(u64::MAX).unwrap();
    // Sanity: fee < total_amount, and (close to) 0.9% within rounding.
    let expected = (u64::MAX as u128) * 90 / 10_000;
    assert_eq!(fee as u128, expected);
}

// Game-verification fee removed — see create_milestone.rs docstring.
// The only protocol fee is the 0.9% STREAM_FEE_BPS on create_stream.
// (Removed: test_game_verification_fee_no_authority_is_zero,
//  test_game_verification_fee_0_1_percent, test_game_verification_fee_rounds_down,
//  test_milestone_budget_rejects_when_only_fee_overflows,
//  test_milestone_budget_exact_match_succeeds,
//  test_milestone_without_game_authority_charges_no_fee.)
