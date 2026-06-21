use anchor_lang::prelude::*;

use crate::state::ProtocolConfig;
use crate::errors::ErrorCode;

pub(crate) use super::_dispatch::__client_accounts_init_protocol_config;
pub use super::_dispatch::{InitProtocolConfig, init_protocol_config_handler as handler};

/// Pure initialiser for `ProtocolConfig` — used by `handler` and unit tests.
/// Sets the `admin` and `treasury` pubkeys and the PDA bump. The PDA is
/// created in the Anchor account struct (`init`), not here.
pub fn init_protocol_config(
    config: &mut ProtocolConfig,
    admin: Pubkey,
    treasury: Pubkey,
    bump: u8,
) -> Result<()> {
    require!(admin != Pubkey::default(), ErrorCode::InvalidProtocolAdmin);
    require!(treasury != Pubkey::default(), ErrorCode::InvalidProtocolAdmin);

    config.admin    = admin;
    config.treasury = treasury;
    config.bump     = bump;

    Ok(())
}
