# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Repository hygiene: moved loose architecture/report docs from the repo root
  into `docs/` and `docs/archive/`.
- Added standard governance files: `LICENSE` (MIT), `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, and GitHub PR/issue templates.
- Rewrote `README.md` into a bilingual (English / Bahasa Indonesia) standard
  layout.

## [0.2.0] — Week 5

### Added
- Cliff + Milestone vesting tiers gating the linear unlock curve.
- `cancel` instruction with prorated vested/unvested split and conservation-law
  verification.
- 10 new Week-5 tests (W5.1–W5.10) covering cliff, milestone, and cancel paths.
- Error variants: `StreamCancelled`, `FullyVested`, `MilestoneNotMet`.

## [0.1.0] — Week 4

### Added
- Core Token Distribution Protocol program (`create_stream`, `withdraw`,
  `cancel`, `fund_vault`, `update_proof`).
- Linear unlock math (`unlocked_amount()`) with `u128` overflow-safe arithmetic.
- VGPV anti-bot fields and 3-strike velocity gating.
- Next.js 14 frontend: proof-of-activity game oracle, waitlist, leaderboard.
- GitHub Actions CI: Anchor build + test on every push.
- Devnet deployment at `DvhxiL5PF8Cq3icqcjdbQvtMhJcj6LWheUgovRpaXTFf`.

[Unreleased]: https://github.com/nayrbryanGaming/blockblast/compare/main...HEAD
