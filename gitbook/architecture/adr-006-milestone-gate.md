# ADR-006: Creator-Controlled Milestone Gate

**Status:** Accepted
**Date:** 2025-12

---

## Context

Some vesting schedules should not unlock based on time alone — they should require an external event to occur first. Examples:

- A team's tokens unlock only after the mainnet product ships
- An advisor's tokens unlock only after a fundraise closes
- An employee's tokens unlock only after a governance vote passes

These events happen off-chain. The protocol needs a mechanism to represent them on-chain without requiring an oracle or external data feed.

---

## Decision

Implement the milestone gate as **two boolean fields** on `StreamAccount`:

- `milestone_enabled: bool` — set immutably at `create_stream` time
- `milestone_reached: bool` — starts `false`; can be flipped to `true` by the creator via `set_milestone`

```rust
// In StreamAccount
pub milestone_enabled: bool,   // immutable after creation
pub milestone_reached: bool,   // one-way: false → true only

// In calculate_unlocked()
if stream.milestone_enabled && !stream.milestone_reached {
    return 0;  // hard stop: no tokens unlock until gate is flipped
}
```

The gate is **one-way**: `set_milestone` checks that `milestone_reached == false` and sets it to `true`. There is no `unset_milestone` instruction.

---

## Alternatives Considered

**Option A: Time-based cliff only**
- ✓ Simple, already implemented
- ✗ Cannot represent non-time events (product launch, governance vote, KPI)
- ✗ The creator still bears the risk of time passing before the event occurs

**Option B: External oracle (Chainlink, Pyth, UMA)**
- ✓ Decentralized verification of off-chain events
- ✗ No general oracle supports arbitrary "did event X happen" queries
- ✗ Significant complexity and cost
- ✗ Creates third-party dependency on oracle liveness

**Option C: DAO/governance-controlled gate**
- ✓ More trustless than creator-controlled
- ✗ Requires integrating with a governance framework (SPL Governance, Realms)
- ✗ Out of scope for v1

**Option D: Creator-controlled boolean gate (chosen)**
- ✓ Zero external dependencies — no oracle needed
- ✓ Can represent *any* off-chain event (the creator decides when it has occurred)
- ✓ Simple to implement, audit, and test
- ✓ Works for common use cases: KPI milestone, fundraise completion, legal sign-off
- ✗ Creator is trusted — a malicious creator can indefinitely withhold the gate
- ✗ No on-chain timeout — if the creator is unresponsive, the gate is never flipped

---

## Consequences

- **Positive:** The milestone gate works for any off-chain event without requiring oracles or governance infrastructure.
- **Positive:** The one-way gate (`false → true`, never reversible) prevents the creator from re-locking tokens once they've been unlocked. If revocation is needed, the creator must cancel the stream.
- **Positive:** Combining `milestone_enabled` with `cliff_time` allows complex unlock conditions: "unlock tokens 90 days after mainnet launch" translates to "milestone gate = mainnet launch, cliff = 90 days after stream start."
- **Negative:** The creator is a trusted party for the gate. There is no on-chain enforcement of *when* the gate must be flipped.
- **Mitigation (recommended for UX):** Integrators should display the stream's `milestone_enabled` status prominently. If the creator hasn't flipped the gate within an agreed timeframe, recipients should use social pressure or legal agreements (off-chain) as recourse.
- **Future consideration:** A timeout-based auto-release could be added (e.g., "if milestone not set by `deadline_time`, tokens unlock anyway"). This would require one additional `i64` field and an extra condition in `calculate_unlocked`. Deferred to v2.
