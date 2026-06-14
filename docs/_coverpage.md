<!-- _coverpage.md -->

# 🍔 BlockBite <small>v1.0</small>

> **Automated, milestone-based token vesting on Solana.**  
> Trustless. Transparent. Built for GameFi.

- **Program ID (Devnet)** — `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`
- **9 on-chain instructions** — stream vesting + campaign rewards
- **41 tests** — all green ✅
- **Anchor 1.0** · **Solana Devnet** · **TypeScript SDK**

```typescript
// Integrate in 5 minutes
const program = new Program(await Program.fetchIdl(PROGRAM_ID, provider)!, provider);
await program.methods.createStream(amount, start, end, cliff, seed, false).accounts({...}).rpc();
```

[Get Started](INTEGRATION_GUIDE.md)
[View on GitHub](https://github.com/BlockBite-GameFi/blockbite-smart-contract)
[Instruction Reference](INSTRUCTION_REFERENCE.md)
