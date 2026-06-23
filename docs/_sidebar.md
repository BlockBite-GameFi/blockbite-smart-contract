<!-- _sidebar.md -->

- **Overview**
  - [Home](README.md)
  - [Quick Start](INTEGRATION_GUIDE.md#2-install-dependencies)

- **Integration**
  - [Integration Guide](INTEGRATION_GUIDE.md)
    - [1. Prerequisites](INTEGRATION_GUIDE.md#1-prerequisites)
    - [2. Install Dependencies](INTEGRATION_GUIDE.md#2-install-dependencies)
    - [3. Load IDL & Program](INTEGRATION_GUIDE.md#3-load-the-idl-and-program)
    - [4. Create a Mint](INTEGRATION_GUIDE.md#4-create-a-token-mint-for-testing)
    - [5. Derive PDAs](INTEGRATION_GUIDE.md#5-derive-pdas)
    - [6. Create a Stream](INTEGRATION_GUIDE.md#6-create-a-stream)
    - [7. Withdraw Tokens](INTEGRATION_GUIDE.md#7-withdraw-vested-tokens-as-recipient)
    - [8. Cancel a Stream](INTEGRATION_GUIDE.md#8-cancel-a-stream-as-creator)
    - [9. Milestone-Gated](INTEGRATION_GUIDE.md#9-milestone-gated-stream-optional)
    - [10. Campaign Rewards](INTEGRATION_GUIDE.md#10-campaign--milestone-rewards)
    - [13. Quickstart Script](INTEGRATION_GUIDE.md#13-complete-quickstart-script)

- **Reference**
  - [Instruction Reference](INSTRUCTION_REFERENCE.md)
    - [create_stream](INSTRUCTION_REFERENCE.md#create_stream)
    - [withdraw](INSTRUCTION_REFERENCE.md#withdraw)
    - [cancel](INSTRUCTION_REFERENCE.md#cancel)
    - [set_milestone](INSTRUCTION_REFERENCE.md#set_milestone)
    - [close_stream](INSTRUCTION_REFERENCE.md#close_stream)
    - [create_campaign](INSTRUCTION_REFERENCE.md#create_campaign)
    - [create_milestone](INSTRUCTION_REFERENCE.md#create_milestone)
    - [verify_game](INSTRUCTION_REFERENCE.md#verify_game)
    - [claim_milestone](INSTRUCTION_REFERENCE.md#claim_milestone)
    - [Error Codes](INSTRUCTION_REFERENCE.md#error-code-index)
    - [PDA Reference](INSTRUCTION_REFERENCE.md#pda-derivation-reference)

- **Architecture**
  - [Decision Records](ARCHITECTURE_DECISIONS.md)
    - [ADR-001 _dispatch.rs](ARCHITECTURE_DECISIONS.md#adr-001-separate-_dispatchrs-for-anchor-boilerplate)
    - [ADR-002 CEI Pattern](ARCHITECTURE_DECISIONS.md#adr-002-cei-checks-effects-interactions-pattern-enforced-on-every-instruction)
    - [ADR-003 Game Oracle](ARCHITECTURE_DECISIONS.md#adr-003-game_authority-as-on-chain-oracle-for-milestone-verification)
    - [ADR-004 Dual PDA](ARCHITECTURE_DECISIONS.md#adr-004-dual-pda-architecture-stream--escrow-as-separate-accounts)
    - [ADR-005 Hash Commits](ARCHITECTURE_DECISIONS.md#adr-005-title_hash--description_hash-as-32-byte-on-chain-commitments)
    - [ADR-006 Milestone Gate](ARCHITECTURE_DECISIONS.md#adr-006-creator-controlled-milestone-gate-on-stream-vesting)

- **Links**
  - [🔗 GitHub](https://github.com/BlockBite-GameFi/blockbite-smart-contract)
  - [🌐 Frontend](https://blockbite-tdp.vercel.app)
  - [🔍 Solana Explorer](https://explorer.solana.com/address/Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq?cluster=devnet)
