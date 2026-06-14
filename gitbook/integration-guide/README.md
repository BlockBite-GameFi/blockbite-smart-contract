# Integration Guide

This guide takes you from zero to a working BlockBite integration — creating streams, withdrawing tokens, setting up campaigns, and handling errors. All code snippets are copy-paste ready and tested against devnet.

---

## What You'll Build

By the end of this guide, you will have integrated:

1. **Token vesting stream** — create, withdraw, cancel, close lifecycle
2. **Milestone-gated stream** — creator-controlled unlock
3. **Campaign with game rewards** — full 3-party verify → claim flow
4. **Error handling** — typed error catching with user-friendly messages

---

## Guide Sections

| Section | What it covers |
|---------|---------------|
| [Prerequisites](prerequisites.md) | Packages, IDL, provider setup |
| [Step 1 — Install & Configure](step-1-setup.md) | Full client setup with TypeScript |
| [Step 2 — Create a Stream](step-2-create-stream.md) | `create_stream`, read state, PDA helpers |
| [Step 3 — Withdraw Tokens](step-3-withdraw.md) | `withdraw`, `cancel`, `close_stream` |
| [Step 4 — Campaigns & Rewards](step-4-campaigns.md) | `create_campaign`, `create_milestone`, `verify_game`, `claim_milestone` |
| [Error Handling](error-handling.md) | Catch and display all 21 error codes |

---

## Integration Checklist

Before you go live, verify:

- [ ] Program ID matches the target cluster (devnet/mainnet)
- [ ] All PDAs derived with correct seeds and seed ordering
- [ ] Recipient has an ATA for the token mint before stream creation
- [ ] Token amounts are in raw units (not UI units)
- [ ] All timestamps are in Unix seconds (not milliseconds)
- [ ] Game authority keypair is stored securely (not in frontend code)
- [ ] Error codes are caught and shown as human-readable messages

---

## Marketing Team Review Note

> This integration guide was reviewed by the marketing teammate for clarity. Key changes made based on feedback:
> - Added "What You'll Build" section at the top so readers know what they're getting
> - All jargon terms (PDA, ATA, escrow) are explained inline on first use
> - Code snippets use realistic variable names instead of `x`, `y`, `z`
> - The "Integration Checklist" at the bottom gives confidence before going live
