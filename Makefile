.PHONY: coverage coverage-strict build test test-unit fmt fmt-check clippy

# ── Code coverage ────────────────────────────────────────────────────────────
# `_dispatch.rs` holds the 9 `#[derive(Accounts)]` Account structs and the
# 9 `*_handler` functions that wire them into Anchor CPIs. None of that code
# is reachable from `cargo test` — it only runs inside the BPF VM at runtime.
# `lib.rs` is the `#[program]` dispatch module (also BPF-only).
#
# The "strict" report excludes both, leaving only the pure business logic
# plus the unit tests themselves.
#
# The "default" report excludes only `_dispatch.rs` and keeps `lib.rs` —
# useful when you want to see the BPF dispatch as part of the denominator.

COV_IGNORE_BPF := --ignore-filename-regex '_dispatch\.rs$$'
COV_IGNORE_STRICT := --ignore-filename-regex '_dispatch\.rs$$|lib\.rs$$'

coverage: ## Standard coverage report (excludes _dispatch.rs only)
	cargo llvm-cov --lib $(COV_IGNORE_BPF) --summary-only

coverage-strict: ## Strict report (excludes _dispatch.rs AND lib.rs)
	cargo llvm-cov --lib $(COV_IGNORE_STRICT) --summary-only

coverage-html: ## HTML coverage report
	cargo llvm-cov --lib $(COV_IGNORE_STRICT) --html --output-dir target/coverage

# ── Standard build / test ────────────────────────────────────────────────────
build:
	cargo build --package blockbite

test-unit:
	cargo test --package blockbite --lib

test: test-unit ## Run unit tests (alias)

test-surfpool: ## Run full anchor test suite on Surfpool (no blockhash issues)
	@echo "Starting Surfpool..."
	@surfpool start --legacy-anchor-compatibility --ci --no-tui --daemon
	@sleep 3
	@echo "Running anchor test on Surfpool..."
	@anchor test --skip-local-validator || (pkill -f surfpool; exit 1)
	@echo "Stopping Surfpool..."
	@pkill -f surfpool

fmt:
	cargo fmt --all

fmt-check:
	cargo fmt --all -- --check

clippy:
	cargo clippy --package blockbite --all-targets -- -D warnings

.DEFAULT_GOAL := help
help:
	@echo "BlockBite — available targets:"
	@echo "  make coverage         — Standard coverage report (excludes _dispatch.rs)"
	@echo "  make coverage-strict  — Strict report (excludes _dispatch.rs + lib.rs)"
	@echo "  make coverage-html    — HTML report → target/coverage/"
	@echo "  make build            — Build the program"
	@echo "  make test / test-unit — Run unit tests (cargo test --lib)"
	@echo "  make fmt / fmt-check  — Format / check formatting"
	@echo "  make clippy           — Run clippy with -D warnings"
