# BlockBite — Security & IT Governance Audit

**Date:** 2026-06-23
**Mode:** Comprehensive (2/10 confidence gate)
**Frameworks:** COBIT 2019, COBIT 5, OWASP Top 10:2025, ISO/IEC 27001:2022, NIST CSF 2.0, STRIDE
**Scope:** `blockbite-smart-contract/` (Anchor program + Next.js web app + CI/CD)

---

## OVERALL SCORE: 61 / 100  (Grade C — "Functional, not production-hardened")

| Framework | Score | Verdict |
|-----------|------:|---------|
| COBIT 2019 (governance + management objectives) | 58/100 | Weak governance, decent build practices |
| COBIT 5 (process enablers) | 60/100 | Process exists but informal/undocumented |
| OWASP Top 10:2025 | 64/100 | Strong on-chain auth; secret + integrity gaps |
| ISO/IEC 27001:2022 | 57/100 | Access control good; key mgmt + ops weak |
| NIST CSF 2.0 | 54/100 | Protect partial; Detect/Respond near-absent |
| Smart-contract security (Anchor) | 82/100 | Genuinely solid |

---

## COBIT 2019 — Domain Scores

| Domain | Objective focus | Score | Evidence |
|--------|-----------------|------:|----------|
| **EDM** Evaluate/Direct/Monitor | EDM03 Risk, EDM04 Resource | 45 | No formal governance body; single-founder authority; no risk register |
| **APO** Align/Plan/Organize | APO12 Risk, APO13 Security, APO14 Data | 52 | Security awareness present (CEI, checked math) but secrets management failing |
| **BAI** Build/Acquire/Implement | BAI03 Build, BAI06 Changes, BAI10 Config | 58 | Tests + CI present; **deployed binary ≠ source** = config/change-management gap |
| **DSS** Deliver/Service/Support | DSS05 Security svcs, DSS04 Continuity | 55 | RPC resilience just added; no monitoring/IR runbook for the program |
| **MEA** Monitor/Evaluate/Assess | MEA03 Compliance | 40 | No logging/alerting pipeline; no compliance tracking |

---

## Key Findings

### [CRITICAL] BB-01: Live Helius API key committed to git
- **Confidence:** 10/10 — COBIT APO13/DSS05, ISO A.9.4/A.10, OWASP A02, NIST PR.DS
- **Location:** `apps/web/.env.production:21` (tracked now + in history: commits `51d9c11d`, `a165ef6e`, `40d74fdc`)
- Key `54fba1b0-7b4c-4e8d-a31f-31b34935f4b2` is recoverable by anyone with repo access → RPC quota theft / billing abuse.
- **Remediation (P0):** rotate the key in Helius **now**; `git rm --cached apps/web/.env.production`; keep the URL only in Vercel env + GitHub Actions secret (the CI already references `secrets.HELIUS_RPC_URL`). History rewrite (BFG/filter-repo) recommended since it's public.

### [HIGH] BB-02: Deployed program does not match source (integrity/change gap)
- **Confidence:** 9/10 — COBIT BAI06/BAI10, OWASP A08, STRIDE-Tampering
- Source `create_stream` = 10 accounts with on-chain `protocol_config` + 0.9% treasury fee (CEI, validated). Deployed `Aso25…` = **8 accounts, no on-chain fee**. The fee is now collected client-side instead (a workaround), so the on-chain invariant the source advertises is not what runs.
- **Remediation (P1):** either redeploy the source build (with `protocol_config` initialized) and switch the frontend back to the on-chain fee, or formally document that `Aso25` is the canonical build and archive the divergent source. Pin a build→deploy hash record.

### [HIGH] BB-03: Program upgrade authority is a single key
- **Confidence:** 7/10 — COBIT EDM03/BAI10, OWASP A08, ISO A.9.2
- `Aso25…` is BPFLoaderUpgradeable (upgradeable in place). A single upgrade authority can silently replace logic governing user funds.
- **Remediation (P1):** move upgrade authority to a multisig (Squads) or set it to immutable once stable; publish the authority address.

### [MEDIUM] BB-04: Dependency vulnerabilities
- **Confidence:** 9/10 — COBIT APO10/BAI03, OWASP A03, NIST ID.RA
- `npm audit`: **26 vulns (4 high, 22 moderate)**; notably `bigint-buffer` buffer overflow (transitive via `@solana/web3.js`), plus wallet-adapter chain.
- **Remediation (P2):** `npm audit fix`; bump `@solana/web3.js` / wallet-adapter to patched lines; add `npm audit` as a CI gate.

### [MEDIUM] BB-05: CI actions pinned to mutable tags
- **Confidence:** 9/10 — COBIT BAI03, OWASP A08/A03
- `.github/workflows/*` use `actions/checkout@v4`, `Swatinem/rust-cache@v2`, `peaceiris/actions-gh-pages@v4` — mutable refs, not commit SHAs. A compromised tag = pipeline RCE.
- **Remediation (P2):** pin every `uses:` to a full 40-char commit SHA.

### [LOW/INFO] BB-06: Solo-authority centralization (by design)
- **Confidence:** 8/10 — COBIT EDM03, STRIDE-Elevation
- `set_milestone` and `cancel` let the **creator unilaterally** flip the milestone (unlocking cliff streams) and claw back. Constraints are correct (`stream.creator == creator`), so it's not a bug — but it's a trust concentration. The UI already labels it "Solo authority — unilateral clawback," which is the right disclosure.
- **Remediation (P3):** offer an optional multisig/timelock authority mode for high-value streams.

---

## What's GOOD (raises the contract sub-score to 82)

- **Authorization is correct everywhere:** `withdraw` (recipient signer + `stream.recipient ==`), `cancel`/`set_milestone`/`close` (creator signer + `stream.creator ==`), `claim_milestone` (recipient + `is_verified` + `!is_claimed`), `verify_game` (`milestone.game_authority == signer`). No missing-signer / IDOR holes.
- **CEI pattern** (effects before CPI) in withdraw/cancel/claim → reentrancy-safe.
- **Checked arithmetic** (`checked_sub`/`checked_add`) → no silent overflow.
- **PDA-derived authorities** for escrow/treasury; treasury validated against `protocol_config.treasury` via canonical ATA derivation.
- Native unit tests + llvm-cov CI job; secrets in CI use encrypted GitHub Secrets (`GAME_AUTHORITY_SECRET_KEY`, `HELIUS_RPC_URL`).

---

## STRIDE summary

| Threat | Status | Note |
|--------|--------|------|
| Spoofing | ✅ Mitigated | Wallet-signature + signer constraints on all instructions |
| Tampering | ⚠️ Partial | Deployed≠source (BB-02); upgrade authority single-key (BB-03) |
| Repudiation | ⚠️ Partial | `msg!` logs only; no off-chain audit trail / alerting |
| Information disclosure | ❌ Gap | Committed RPC key (BB-01) |
| Denial of Service | ⚠️ Improved | Public RPC 429/Internal-error mitigated via skipPreflight + dedicated-RPC guidance; no compute-budget abuse on-chain |
| Elevation of privilege | ✅/⚠️ | On-chain checks correct; creator centralization by design (BB-06) |

---

## Remediation Roadmap

- **P0 (now):** BB-01 rotate + untrack Helius key.
- **P1 (this sprint):** BB-02 reconcile deployed vs source; BB-03 multisig upgrade authority.
- **P2 (this month):** BB-04 dependency patching + CI audit gate; BB-05 SHA-pin CI actions.
- **P3 (backlog):** BB-06 optional multisig/timelock authority mode; add monitoring/alerting (MEA03 / NIST Detect).

## Confidence Calibration
- Total findings: 6 — CRITICAL 1, HIGH 2, MEDIUM 2, LOW/INFO 1
- False positives filtered: Anchor IDL (public), PDAs (public by design), `.env.example` placeholders, test keypairs
- Mode: Comprehensive (2/10 gate)
