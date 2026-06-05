use trident_fuzz::fuzzing::*;

/// Storage for all account addresses used in fuzz testing.
///
/// This struct serves as a centralized repository for account addresses,
/// enabling their reuse across different instruction flows and test scenarios.
///
/// Docs: https://ackee.xyz/trident/docs/latest/trident-api-macro/trident-types/fuzz-accounts/
#[derive(Default)]
pub struct AccountAddresses {
    pub creator: AddressStorage,

    pub stream: AddressStorage,

    pub mint: AddressStorage,

    pub escrow_token_account: AddressStorage,

    pub creator_token_account: AddressStorage,

    pub recipient_token_account: AddressStorage,

    pub token_program: AddressStorage,

    pub recipient: AddressStorage,

    pub system_program: AddressStorage,

    pub milestone: AddressStorage,

    pub campaign: AddressStorage,

    pub campaign_escrow: AddressStorage,

    pub founder: AddressStorage,

    pub founder_token_account: AddressStorage,

    pub game_program: AddressStorage,

    pub signer_0: AddressStorage,

    pub signer_1: AddressStorage,

    pub signer_2: AddressStorage,

    pub signer_3: AddressStorage,

    pub signer_4: AddressStorage,

    pub oracle: AddressStorage,
}
