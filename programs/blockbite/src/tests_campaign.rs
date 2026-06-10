use crate::state::{CampaignAccount, MilestoneAccount};
use anchor_lang::prelude::Pubkey;

fn make_campaign(
    founder: Pubkey,
    total_budget: u64,
) -> CampaignAccount {
    CampaignAccount {
        founder,
        title_hash: [1u8; 32],
        total_budget,
        allocated_amount: 0,
        milestone_count: 0,
        bump: 0,
    }
}

fn make_milestone(
    campaign: Pubkey,
    recipient: Pubkey,
    token_amount: u64,
    game_authority: Pubkey,
) -> MilestoneAccount {
    MilestoneAccount {
        campaign,
        recipient,
        description_hash: [2u8; 32],
        game_authority,
        token_amount,
        target_level: 10,
        achieved_level: 0,
        difficulty: 2,
        is_verified: false,
        is_claimed: false,
        bump: 0,
    }
}

#[test]
fn test_campaign_initial_state() {
    let founder = Pubkey::new_unique();
    let campaign = make_campaign(founder, 1_000_000);
    assert_eq!(campaign.founder, founder);
    assert_eq!(campaign.total_budget, 1_000_000);
    assert_eq!(campaign.allocated_amount, 0);
    assert_eq!(campaign.milestone_count, 0);
}

#[test]
fn test_milestone_initial_state() {
    let campaign = Pubkey::new_unique();
    let recipient = Pubkey::new_unique();
    let game = Pubkey::new_unique();

    let milestone = make_milestone(campaign, recipient, 5_000, game);
    assert_eq!(milestone.campaign, campaign);
    assert_eq!(milestone.recipient, recipient);
    assert_eq!(milestone.token_amount, 5_000);
    assert_eq!(milestone.target_level, 10);
    assert_eq!(milestone.achieved_level, 0);
    assert_eq!(milestone.difficulty, 2);
    assert!(!milestone.is_verified);
    assert!(!milestone.is_claimed);
    assert_eq!(milestone.game_authority, game);
}

#[test]
fn test_milestone_verification_game() {
    let campaign = Pubkey::new_unique();
    let recipient = Pubkey::new_unique();
    let game = Pubkey::new_unique();

    let mut milestone = make_milestone(campaign, recipient, 5_000, game);
    milestone.achieved_level = 10;
    milestone.is_verified = true;
    assert!(milestone.is_verified);
    assert_eq!(milestone.game_authority, game);
    assert_eq!(milestone.achieved_level, 10);
}

#[test]
fn test_campaign_budget_tracking() {
    let founder = Pubkey::new_unique();
    let mut campaign = make_campaign(founder, 1_000_000);

    // Allocate milestones
    campaign.allocated_amount += 100_000;
    campaign.milestone_count += 1;
    assert_eq!(campaign.allocated_amount, 100_000);
    assert_eq!(campaign.milestone_count, 1);

    campaign.allocated_amount += 200_000;
    campaign.milestone_count += 1;
    assert_eq!(campaign.allocated_amount, 300_000);
    assert_eq!(campaign.milestone_count, 2);

    // Budget check
    assert!(campaign.allocated_amount <= campaign.total_budget);
}

#[test]
fn test_campaign_budget_overflow_protection() {
    let founder = Pubkey::new_unique();
    let mut campaign = make_campaign(founder, u64::MAX);

    let result = campaign.allocated_amount.checked_add(1);
    assert!(result.is_some());

    // Simulate overflow
    let overflow = campaign.total_budget.checked_add(1);
    assert!(overflow.is_none());
}

#[test]
fn test_milestone_account_size() {
    assert_eq!(MilestoneAccount::LEN, 150);
}
