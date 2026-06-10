# BlockBite Game Server

The off-chain game server that verifies player achievements and signs on-chain `verify_game` transactions.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Frontend   │────▶│ Game Server  │────▶│  Solana     │
│  (React)    │     │  (Express)   │     │  (on-chain) │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                    Holds game_authority
                    keypair securely
```

## Setup

1. **Generate game authority keypair:**
   ```bash
   solana-keygen new --outfile game-authority.json
   # Copy the secret key array from the JSON file
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Install dependencies:**
   ```bash
   pnpm install
   ```

4. **Run:**
   ```bash
   pnpm dev    # Development with hot reload
   pnpm start  # Production
   ```

## API Endpoints

### `POST /api/verify`

Verifies a player's game completion and submits the on-chain transaction.

**Request:**
```json
{
  "userId": "player_123",
  "campaignPda": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "milestoneSeed": "200",
  "achievedLevel": 15,
  "gameSessionId": "session_abc123"
}
```

**Response (success):**
```json
{
  "ok": true,
  "signature": "5KtP9...",
  "message": "Game verification successful",
  "achievedLevel": 15
}
```

**Response (failure):**
```json
{
  "error": "Game verification failed",
  "message": "User has not completed the required level"
}
```

### `POST /api/test/simulate-game` (Development Only)

Simulates a game completion for testing. Remove in production.

**Request:**
```json
{
  "userId": "player_123",
  "sessionId": "session_abc123",
  "level": 15
}
```

### `GET /health`

Health check endpoint.

## Security

| Measure | Implementation |
|---|---|
| Keypair security | Loaded from env var, never exposed to frontend |
| Level validation | Server-side check before signing |
| On-chain enforcement | `achieved_level >= target_level` also enforced on-chain |
| Idempotency | On-chain `is_verified` flag prevents double verification |

## Production Checklist

- [ ] Replace in-memory `gameSessions` with Redis/database
- [ ] Add authentication middleware (JWT/API keys)
- [ ] Add rate limiting
- [ ] Remove `/api/test/simulate-game` endpoint
- [ ] Add logging and monitoring
- [ ] Use a hardware security module (HSM) for keypair storage
- [ ] Add webhook to notify frontend of verification result
