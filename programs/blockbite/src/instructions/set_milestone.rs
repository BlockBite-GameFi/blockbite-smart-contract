use anchor_lang::prelude::*;

use crate::state::StreamAccount;

pub(crate) use super::_dispatch::__client_accounts_set_milestone;
pub use super::_dispatch::{SetMilestone, set_milestone_handler as handler};

/// Pure milestone flip — used by `handler` and unit tests.
/// Sets `milestone_reached = true` and forces `milestone_enabled = true`.
pub fn set_milestone_reached(stream: &mut StreamAccount) {
    stream.milestone_reached = true;
    stream.milestone_enabled = true;
}
