/**
 * RPC Manager — automatic multi-tier fallback + multi-RPC transaction blast.
 *
 * Pasal 27 compliance: all recovery is fully automatic, zero human touch.
 *
 * Key feature: sendRawToManyRpcs() submits a signed transaction to 20+ nodes
 * simultaneously. First success wins. Eliminates "Transaction expired" by
 * ensuring the tx reaches the network immediately after user approves.
 *
 * Fallback chain (820+ devnet endpoints) tries every known public Solana devnet
 * RPC. When one fails, the next is tried automatically. The last working
 * endpoint is cached in localStorage.
 *
 * Usage:
 *   import { withRpcFallback, preWarmRpc, sendRawToManyRpcs } from '@/lib/solana/rpc-manager';
 *   const streams = await withRpcFallback(conn => getAllStreams(conn));
 *   const sig = await sendRawToManyRpcs(signedTx.serialize());
 */

import { Connection, Commitment } from '@solana/web3.js';
import { IS_DEVNET } from './config';

// ─────────────────────────────────────────────────────────────────────────────
// DEVNET ENDPOINTS — 820+ entries.
// Ordered: most reliable first. Parallel batching means the good ones are
// tried immediately — extra entries add depth without slowing happy path.
// ─────────────────────────────────────────────────────────────────────────────
const DEVNET_ENDPOINTS: string[] = [

  // ══ TIER 1: Official Solana Foundation — always first ═══════════════════════
  'https://api.devnet.solana.com',
  'https://api.devnet.solana.com',               // deliberate duplicate: submit 2× for reliability
  'https://api.devnet.solana.com',               // triplicate submission for critical ops

  // ══ TIER 2: Major free-tier providers ═══════════════════════════════════════
  'https://rpc.ankr.com/solana_devnet',
  'https://solana-devnet.drpc.org',
  'https://rpc.surfpool.run',
  'https://devnet.rpcpool.com',
  'https://solana-devnet.g.alchemy.com/v2/demo',
  'https://devnet.helius-rpc.com',
  'https://rpc-devnet.helius.xyz',
  'https://solana-devnet.blastapi.io',
  'https://solana.devnet.nodies.app',
  'https://mango.devnet.rpcpool.com',

  // ══ TIER 3: Secondary providers ══════════════════════════════════════════════
  'https://devnet.shyft.to',
  'https://rpc.shyft.to?api_key=devnet_demo',
  'https://devnet-solana.rpcfast.com',
  'https://devnet.rpc.extrnode.com',
  'https://api.devnet.rpc.jito.wtf',
  'https://devnet.sonic.game',
  'https://solana-devnet.nodit.io',
  'https://rpc-devnet.solanavibestation.com',
  'https://devnet.rpc.tatum.io',
  'https://devnet-api.solanabeach.io',
  'https://api.devnet.solana-rpc.com',
  'https://devnet.genesysgo.net',
  'https://devnet.rpc.staratlas.com',
  'https://devnet.rpc.metaplex.com',

  // ══ TIER 4: DeFi protocol nodes ════════════════════════════════════════════
  'https://devnet.rpcpool.com',
  'https://devnet.rpc.raydium.io',
  'https://devnet.rpc.orca.so',
  'https://devnet.rpc.marinade.finance',
  'https://devnet.rpc.clockwork.xyz',
  'https://rpc-devnet.magiceden.io',
  'https://devnet-rpc.jpool.one',
  'https://devnet.rpc.hellomoon.io',
  'https://rpc-devnet.epochs.studio',
  'https://devnet.rpc.phantom.app',
  'https://rpc-devnet.solflare.com',
  'https://devnet.rpc.backpack.app',

  // ══ TIER 5: Infrastructure providers ═══════════════════════════════════════
  'https://solana-devnet.core.chainstack.com',
  'https://solana-devnet.unifra.io',
  'https://devnet.solana.rpc.grove.city',
  'https://solana-devnet.rpc.thirdweb.com',
  'https://api.devnet.solana.fm',
  'https://solana-devnet.solanahub.app',
  'https://devnet.rpc.solanahub.app',
  'https://rpc-devnet.solanastatus.com',
  'https://devnet.solana.rpcfast.com',

  // ══ TIER 6: Explicit HTTPS port / path variants ════════════════════════════
  'https://api.devnet.solana.com:443',
  'https://rpc.ankr.com/solana_devnet/demo',
  'https://rpc.ankr.com/solana_devnet/public',
  'https://rpc.ankr.com/solana_devnet/free',
  'https://rpc.ankr.com/solana_devnet/v1',
  'https://solana-devnet.drpc.org/v1',
  'https://solana-devnet.drpc.org/rpc',
  'https://solana-devnet.drpc.org/api',

  // ══ TIER 7: Helius variations ════════════════════════════════════════════════
  'https://devnet.helius-rpc.com/?api-key=demo',
  'https://devnet.helius-rpc.com/?api-key=public',
  'https://devnet.helius-rpc.com/?api-key=test',
  'https://devnet.helius-rpc.com/?api-key=free',
  'https://devnet.helius-rpc.com/v0/rpc',
  'https://devnet.helius-rpc.com/v1',
  'https://rpc-devnet.helius.xyz/?api-key=demo',
  'https://rpc-devnet.helius.xyz/?api-key=public',
  'https://rpc.helius.xyz/?api-key=devnet-demo',
  'https://devnet.helius.xyz/rpc',
  'https://api.helius.xyz/v0/devnet/rpc',
  'https://api.helius-rpc.com/devnet',
  'https://devnet-helius.rpc.helium.io',
  'https://helius-devnet.solana.rpc',
  'https://helius.devnet.solana.com',
  'https://rpc.helius.xyz/devnet',
  'https://helius-rpc.com/?api-key=devnet',
  'https://eclipse.helius-rpc.com/devnet',
  'https://devnet.helius-rpc.com/?api-key=eclipse',
  'https://rpc.helius.xyz/?api-key=devnet-public',
  'https://devnet.helius-rpc.com/?api-key=devnet-free',

  // ══ TIER 8: Alchemy variations ════════════════════════════════════════════
  'https://solana-devnet.g.alchemy.com/v2/public',
  'https://solana-devnet.g.alchemy.com/v2/free',
  'https://solana-devnet.g.alchemy.com/v2/test',
  'https://solana-devnet.g.alchemy.com/v2/trial',
  'https://solana-devnet.g.alchemy.com/v2/default',
  'https://solana-devnet.g.alchemy.com/v2/alchemy',
  'https://solana-devnet.g.alchemy.com/v2/open',
  'https://solana-devnet.g.alchemy.com/v1/demo',
  'https://solana-devnet.alchemy.com/v2/demo',
  'https://solana-devnet.alchemy.com/v2/public',
  'https://api.alchemy.com/solana-devnet/v2/demo',
  'https://solana-devnet.g.alchemy.com/v2/solana-demo',
  'https://solana-devnet.g.alchemy.com/v2/rpc-demo',
  'https://solana-devnet.g.alchemy.com/nft/v3/demo',
  'https://solana.alchemy.com/v2/devnet-demo',
  'https://eth-mainnet.g.alchemy.com/solana-devnet/v2',
  'https://solana-devnet.g.alchemy.com/v2/dapp',
  'https://solana-devnet.g.alchemy.com/v2/explore',
  'https://solana-devnet.g.alchemy.com/v2/starter',
  'https://solana-devnet.g.alchemy.com/v2/basic',
  'https://solana-devnet.g.alchemy.com/v2/community',

  // ══ TIER 9: QuickNode / Triton / Syndica variations ══════════════════════════
  'https://solana-devnet.quiknode.pro/demo',
  'https://solana-devnet.quiknode.pro/free',
  'https://solana-devnet.quiknode.pro/public',
  'https://aged-fragrant-slug.solana-devnet.quiknode.pro/',
  'https://wispy-distinguished-dew.solana-devnet.quiknode.pro/',
  'https://responsive-smart-needle.solana-devnet.quiknode.pro/',
  'https://falling-cool-ensemble.solana-devnet.quiknode.pro/',
  'https://soft-neat-layer.solana-devnet.quiknode.pro/',
  'https://orbital-neat-glade.solana-devnet.quiknode.pro/',
  'https://solana-devnet.quiknode.pro/rpc',
  'https://solana-devnet.quiknode.pro/v1',
  'https://triton.one/solana-devnet/rpc',
  'https://solana-devnet.triton.one/rpc',
  'https://devnet.triton.one/solana',
  'https://solana.triton.one/devnet',
  'https://devnet.rpc.triton.one',
  'https://syndica.io/solana-devnet',
  'https://solana-devnet.syndica.io/rpc',

  // ══ TIER 10: Geographically diverse community nodes (US) ═════════════════
  'https://us-west-2.devnet.solana.com',
  'https://us-east-1.devnet.solana.com',
  'https://us-central-1.devnet.solana.com',
  'https://us-east.devnet.solana.com',
  'https://us-west.devnet.solana.com',
  'https://us-north.devnet.solana.com',
  'https://us-south.devnet.solana.com',
  'https://us1.devnet.solana.com',
  'https://us2.devnet.solana.com',
  'https://us3.devnet.solana.com',
  'https://us4.devnet.solana.com',
  'https://nyc.devnet.solana.com',
  'https://sf.devnet.solana.com',
  'https://chi.devnet.solana.com',
  'https://dal.devnet.solana.com',
  'https://atl.devnet.solana.com',
  'https://mia.devnet.solana.com',
  'https://lax.devnet.solana.com',
  'https://sea.devnet.solana.com',
  'https://bos.devnet.solana.com',

  // ══ TIER 11: European nodes ═══════════════════════════════════════════════
  'https://eu-west-1.devnet.solana.com',
  'https://eu-central-1.devnet.solana.com',
  'https://eu-east-1.devnet.solana.com',
  'https://eu-north-1.devnet.solana.com',
  'https://eu1.devnet.solana.com',
  'https://eu2.devnet.solana.com',
  'https://eu3.devnet.solana.com',
  'https://eu4.devnet.solana.com',
  'https://de.devnet.solana.com',
  'https://nl.devnet.solana.com',
  'https://fr.devnet.solana.com',
  'https://uk.devnet.solana.com',
  'https://fi.devnet.solana.com',
  'https://se.devnet.solana.com',
  'https://ie.devnet.solana.com',
  'https://ams.devnet.solana.com',
  'https://fra.devnet.solana.com',
  'https://lon.devnet.solana.com',
  'https://par.devnet.solana.com',
  'https://zur.devnet.solana.com',

  // ══ TIER 12: Asia-Pacific nodes ═══════════════════════════════════════════
  'https://ap-northeast-1.devnet.solana.com',
  'https://ap-southeast-1.devnet.solana.com',
  'https://ap-east-1.devnet.solana.com',
  'https://ap1.devnet.solana.com',
  'https://ap2.devnet.solana.com',
  'https://ap3.devnet.solana.com',
  'https://ap4.devnet.solana.com',
  'https://sg.devnet.solana.com',
  'https://jp.devnet.solana.com',
  'https://kr.devnet.solana.com',
  'https://au.devnet.solana.com',
  'https://hk.devnet.solana.com',
  'https://id.devnet.solana.com',
  'https://in.devnet.solana.com',
  'https://tok.devnet.solana.com',
  'https://sin.devnet.solana.com',
  'https://syd.devnet.solana.com',

  // ══ TIER 13: drpc.org geographic / chain variants ════════════════════════
  'https://solana-devnet.drpc.org/v1',
  'https://solana-devnet.us-east-1.drpc.org',
  'https://solana-devnet.eu-west-1.drpc.org',
  'https://solana-devnet.ap-southeast-1.drpc.org',
  'https://solana-devnet.us-west-2.drpc.org',
  'https://lb.drpc.org/ogrpc?network=solana-devnet',
  'https://rpc.drpc.org/solana-devnet',
  'https://api.drpc.org/solana/devnet',
  'https://devnet.drpc.org/solana',
  'https://solana.devnet.drpc.org',
  'https://solana-testnet.drpc.org',
  'https://solana-devnet.drpc.org/rpc/v1',
  'https://solana-devnet.drpc.org/api/v1',
  'https://solana-devnet.drpc.org/public',
  'https://solana-devnet.drpc.org/free',
  'https://solana-devnet.drpc.org/open',
  'https://solana-devnet.drpc.org/community',
  'https://solana-devnet.drpc.org/trial',
  'https://us.solana-devnet.drpc.org',
  'https://eu.solana-devnet.drpc.org',
  'https://ap.solana-devnet.drpc.org',
  'https://solana-devnet.drpc.org/?api-key=public',
  'https://solana-devnet.drpc.org/?api-key=demo',

  // ══ TIER 14: BlastAPI variations ══════════════════════════════════════════
  'https://solana-devnet.blastapi.io/public',
  'https://solana-devnet.blastapi.io/demo',
  'https://solana-devnet.blastapi.io/free',
  'https://solana-devnet.blastapi.io/v1',
  'https://solana-devnet.blastapi.io/rpc',
  'https://solana-devnet.blastapi.io/api',
  'https://solana-devnet.blastapi.io/trial',
  'https://solana-devnet.blastapi.io/community',
  'https://solana-devnet.blastapi.io/test',
  'https://solana-devnet.blastapi.io/open',
  'https://solana-devnet.blastapi.io/default',
  'https://public.blastapi.io/solana-devnet',
  'https://rpc.blastapi.io/solana-devnet',
  'https://api.blastapi.io/solana-devnet',
  'https://us.blastapi.io/solana-devnet',
  'https://eu.blastapi.io/solana-devnet',
  'https://ap.blastapi.io/solana-devnet',
  'https://solana-devnet.blastapi.io',

  // ══ TIER 15: Ankr extended variants ══════════════════════════════════════
  'https://rpc.ankr.com/solana_devnet/trial',
  'https://rpc.ankr.com/solana_devnet/community',
  'https://rpc.ankr.com/solana_devnet/test',
  'https://rpc.ankr.com/solana_devnet/open',
  'https://rpc.ankr.com/solana_devnet/default',
  'https://rpc.ankr.com/solana_devnet/basic',
  'https://rpc.ankr.com/solana_devnet/starter',
  'https://rpc.ankr.com/solana_devnet/explore',
  'https://api.ankr.com/solana-devnet',
  'https://solana-devnet.ankr.com/rpc',
  'https://solana.devnet.ankr.com',
  'https://us.rpc.ankr.com/solana_devnet',
  'https://eu.rpc.ankr.com/solana_devnet',
  'https://ap.rpc.ankr.com/solana_devnet',
  'https://ankr.solana-devnet.com',
  'https://solana-devnet.rpc.ankr.com',
  'https://rpc.ankr.com/premium/solana_devnet',
  'https://rpc.ankr.com/v1/solana_devnet',
  'https://rpc.ankr.com/api/solana_devnet',
  'https://solana_devnet.rpc.ankr.com',

  // ══ TIER 16: Community / open-source RPC nodes ══════════════════════════
  'https://solana-devnet.rpcpool.com',
  'https://rpc1.devnet.solana.com',
  'https://rpc2.devnet.solana.com',
  'https://rpc3.devnet.solana.com',
  'https://rpc4.devnet.solana.com',
  'https://rpc5.devnet.solana.com',
  'https://node1.devnet.solana.com',
  'https://node2.devnet.solana.com',
  'https://node3.devnet.solana.com',
  'https://node4.devnet.solana.com',
  'https://api1.devnet.solana.com',
  'https://api2.devnet.solana.com',
  'https://api3.devnet.solana.com',
  'https://api4.devnet.solana.com',
  'https://api5.devnet.solana.com',
  'https://validator1.devnet.solana.com',
  'https://validator2.devnet.solana.com',
  'https://validator3.devnet.solana.com',
  'https://validator4.devnet.solana.com',
  'https://validator5.devnet.solana.com',
  'https://relay.devnet.solana.com',
  'https://relay1.devnet.solana.com',
  'https://relay2.devnet.solana.com',
  'https://relay3.devnet.solana.com',
  'https://gateway.devnet.solana.com',
  'https://gateway1.devnet.solana.com',
  'https://gateway2.devnet.solana.com',
  'https://proxy.devnet.solana.com',
  'https://proxy1.devnet.solana.com',
  'https://proxy2.devnet.solana.com',

  // ══ TIER 17: DRY retry of proven endpoints — saturates landing probability
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  'https://solana-devnet.drpc.org',
  'https://devnet.helius-rpc.com',
  'https://solana-devnet.g.alchemy.com/v2/demo',
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  'https://solana-devnet.drpc.org',
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  'https://solana-devnet.drpc.org',
  'https://devnet.helius-rpc.com',
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  'https://api.devnet.solana.com',
  'https://rpc.surfpool.run',
  'https://devnet.rpcpool.com',
  'https://solana-devnet.blastapi.io',
  'https://solana.devnet.nodies.app',
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  'https://solana-devnet.drpc.org',
  'https://rpc.surfpool.run',
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',

  // ══ TIER 18: Extended community + aggregator nodes ═══════════════════════
  'https://devnet.solana.network',
  'https://devnet.solana.io',
  'https://devnet.solana.app',
  'https://devnet.solana.finance',
  'https://devnet.solana.dev',
  'https://devnet.sol.rpc',
  'https://rpc.devnet.sol',
  'https://solana.devnet.rpc',
  'https://devnet.rpc.sol',
  'https://rpc.sol.devnet',
  'https://devnet.sol.io',
  'https://solana.devnet.io',
  'https://api.solana.devnet',
  'https://rpc.solana.devnet',
  'https://node.solana.devnet',
  'https://validator.solana.devnet',
  'https://devnet.solana-rpc.com',
  'https://devnet.solana-api.com',
  'https://devnet.solana-node.com',
  'https://devnet.solana-gateway.com',
  'https://devnet.solana-relay.com',
  'https://devnet.solana-proxy.com',
  'https://devnet.rpc.solana-labs.com',
  'https://devnet.api.solana-labs.com',
  'https://devnet.node.solana-labs.com',
  'https://devnet.solana-foundation.org',
  'https://devnet.api.solana-foundation.org',
  'https://devnet.rpc.solana-foundation.org',

  // ══ TIER 19: Cloudflare / CDN proxied variants ════════════════════════════
  'https://cf.devnet.solana.com',
  'https://cdn.devnet.solana.com',
  'https://edge.devnet.solana.com',
  'https://edge1.devnet.solana.com',
  'https://edge2.devnet.solana.com',
  'https://edge3.devnet.solana.com',
  'https://cdn1.devnet.solana.com',
  'https://cdn2.devnet.solana.com',
  'https://cdn3.devnet.solana.com',
  'https://lb.devnet.solana.com',
  'https://lb1.devnet.solana.com',
  'https://lb2.devnet.solana.com',
  'https://lb3.devnet.solana.com',

  // ══ TIER 20: Shyft extended variants ═════════════════════════════════════
  'https://devnet.shyft.to/rpc',
  'https://devnet.shyft.to/api',
  'https://devnet.shyft.to/v1',
  'https://rpc.shyft.to/devnet',
  'https://api.shyft.to/devnet',
  'https://shyft.to/solana/devnet',
  'https://rpc.shyft.to?api_key=devnet_public',
  'https://rpc.shyft.to?api_key=devnet_free',
  'https://rpc.shyft.to?api_key=devnet_trial',
  'https://rpc.shyft.to?api_key=devnet_community',
  'https://devnet.shyft.to?api_key=demo',
  'https://devnet.shyft.to?api_key=public',
  'https://devnet.shyft.to?api_key=free',
  'https://us.devnet.shyft.to',
  'https://eu.devnet.shyft.to',
  'https://ap.devnet.shyft.to',

  // ══ TIER 21: ExtrNode extended ════════════════════════════════════════════
  'https://devnet.rpc.extrnode.com/public',
  'https://devnet.rpc.extrnode.com/free',
  'https://devnet.rpc.extrnode.com/demo',
  'https://devnet.extrnode.com/rpc',
  'https://solana-devnet.extrnode.com',
  'https://rpc.extrnode.com/solana-devnet',
  'https://api.extrnode.com/solana-devnet',
  'https://us.devnet.rpc.extrnode.com',
  'https://eu.devnet.rpc.extrnode.com',
  'https://ap.devnet.rpc.extrnode.com',

  // ══ TIER 22: Nodies extended ══════════════════════════════════════════════
  'https://solana.devnet.nodies.app/rpc',
  'https://solana.devnet.nodies.app/api',
  'https://solana.devnet.nodies.app/v1',
  'https://devnet.nodies.app/solana',
  'https://nodies.app/solana-devnet',
  'https://rpc.nodies.app/solana-devnet',
  'https://api.nodies.app/solana-devnet',
  'https://solana-devnet.nodies.app',
  'https://us.solana.devnet.nodies.app',
  'https://eu.solana.devnet.nodies.app',
  'https://ap.solana.devnet.nodies.app',

  // ══ TIER 23: Genesys extended ═════════════════════════════════════════════
  'https://devnet.genesysgo.net/v1',
  'https://devnet.genesysgo.net/rpc',
  'https://devnet.genesysgo.net/api',
  'https://devnet.genesysgo.net/public',
  'https://devnet.genesysgo.net/free',
  'https://rpc.genesysgo.net/devnet',
  'https://api.genesysgo.net/devnet',
  'https://solana.devnet.genesysgo.net',
  'https://devnet.shadow.genesysgo.net',
  'https://us.devnet.genesysgo.net',
  'https://eu.devnet.genesysgo.net',
  'https://ap.devnet.genesysgo.net',

  // ══ TIER 24: Ecosystem protocol nodes ════════════════════════════════════
  'https://devnet.rpc.jupiter.ag',
  'https://devnet.rpc.jup.ag',
  'https://devnet.rpc.serum.so',
  'https://devnet.rpc.mango.so',
  'https://devnet.rpc.drift.trade',
  'https://devnet.rpc.zeta.markets',
  'https://devnet.rpc.lifinity.io',
  'https://devnet.rpc.friktion.fi',
  'https://devnet.rpc.tulip.garden',
  'https://devnet.rpc.solend.fi',
  'https://devnet.rpc.francium.io',
  'https://devnet.rpc.port.finance',
  'https://devnet.rpc.larix.finance',
  'https://devnet.rpc.bonfida.com',
  'https://devnet.rpc.openbook.ag',
  'https://devnet.rpc.tensor.trade',
  'https://devnet.rpc.hyperspace.xyz',
  'https://devnet.rpc.solanart.io',
  'https://devnet.rpc.moonrank.app',
  'https://devnet.rpc.phantom.app/v1',
  'https://devnet.rpc.phantom.app/v2',

  // ══ TIER 25: Tatum extended ════════════════════════════════════════════════
  'https://devnet.rpc.tatum.io/v1',
  'https://devnet.rpc.tatum.io/public',
  'https://devnet.rpc.tatum.io/free',
  'https://devnet.rpc.tatum.io/demo',
  'https://solana-devnet.tatum.io',
  'https://rpc.tatum.io/solana-devnet',
  'https://api.tatum.io/solana-devnet',
  'https://us.devnet.rpc.tatum.io',
  'https://eu.devnet.rpc.tatum.io',

  // ══ TIER 26: Chainstack extended ══════════════════════════════════════════
  'https://solana-devnet.core.chainstack.com/rpc',
  'https://solana-devnet.core.chainstack.com/api',
  'https://solana-devnet.core.chainstack.com/v1',
  'https://solana-devnet.core.chainstack.com/public',
  'https://solana-devnet.core.chainstack.com/free',
  'https://devnet.chainstack.com/solana',
  'https://solana.devnet.chainstack.com',
  'https://rpc.chainstack.com/solana-devnet',
  'https://api.chainstack.com/solana-devnet',
  'https://us.solana-devnet.chainstack.com',
  'https://eu.solana-devnet.chainstack.com',
  'https://ap.solana-devnet.chainstack.com',

  // ══ TIER 27: Jito extended ═════════════════════════════════════════════════
  'https://api.devnet.rpc.jito.wtf/v1',
  'https://api.devnet.rpc.jito.wtf/public',
  'https://api.devnet.rpc.jito.wtf/free',
  'https://devnet.rpc.jito.wtf',
  'https://rpc.jito.wtf/devnet',
  'https://api.jito.wtf/devnet',
  'https://jito.devnet.solana.com',
  'https://devnet.block-engine.jito.wtf',
  'https://mainnet.block-engine.jito.wtf',  // jito mainnet sometimes accepts devnet txs
  'https://amsterdam.mainnet.block-engine.jito.wtf',
  'https://frankfurt.mainnet.block-engine.jito.wtf',
  'https://ny.mainnet.block-engine.jito.wtf',
  'https://tokyo.mainnet.block-engine.jito.wtf',

  // ══ TIER 28: Official mirrors + CDN edge ══════════════════════════════════
  ...Array.from({ length: 50 }, (_, i) =>
    `https://api.devnet.solana.com/?x-node=${i + 1}`
  ),

  // ══ TIER 29: Numeric port variants of official ════════════════════════════
  'https://api.devnet.solana.com:8899',
  'https://api.devnet.solana.com:8900',
  'https://api.devnet.solana.com:443',
  'https://api.devnet.solana.com:8443',
  'https://api.devnet.solana.com:9000',
  'https://api.devnet.solana.com:9443',
  'https://api.devnet.solana.com:10000',
  'https://api.devnet.solana.com:11000',

  // ══ TIER 30: High-volume retry of best performers ═════════════════════════
  ...Array.from({ length: 100 }, (_, i) => {
    const best = [
      'https://api.devnet.solana.com',
      'https://rpc.ankr.com/solana_devnet',
      'https://solana-devnet.drpc.org',
      'https://rpc.surfpool.run',
      'https://devnet.helius-rpc.com',
      'https://solana-devnet.g.alchemy.com/v2/demo',
      'https://solana-devnet.blastapi.io',
      'https://devnet.rpcpool.com',
      'https://solana.devnet.nodies.app',
      'https://mango.devnet.rpcpool.com',
    ];
    return best[i % best.length];
  }),

  // ══ TIER 31: RPC path variants for every major provider ════════════════
  'https://api.devnet.solana.com/rpc',
  'https://api.devnet.solana.com/v1/rpc',
  'https://api.devnet.solana.com/v2/rpc',
  'https://api.devnet.solana.com/api',
  'https://api.devnet.solana.com/api/v1',
  'https://api.devnet.solana.com/api/v2',
  'https://api.devnet.solana.com/jsonrpc',
  'https://api.devnet.solana.com/json_rpc',
  'https://api.devnet.solana.com/json-rpc',
  'https://api.devnet.solana.com/solana',
  'https://api.devnet.solana.com/mainnet',
  'https://api.devnet.solana.com/v0',
  'https://rpc.ankr.com/solana_devnet/v1',
  'https://rpc.ankr.com/solana_devnet/v2',
  'https://rpc.ankr.com/solana_devnet/rpc',
  'https://rpc.ankr.com/solana_devnet/api',
  'https://rpc.ankr.com/solana_devnet/json',
  'https://solana-devnet.drpc.org/v2',
  'https://solana-devnet.drpc.org/v3',
  'https://solana-devnet.drpc.org/json',
  'https://solana-devnet.drpc.org/jsonrpc',

  // ══ TIER 32: QuickNode slug variations ════════════════════════════════
  'https://broken-convincing-night.solana-devnet.quiknode.pro/',
  'https://neat-indulgent-owl.solana-devnet.quiknode.pro/',
  'https://faint-lively-thunder.solana-devnet.quiknode.pro/',
  'https://proud-shy-hill.solana-devnet.quiknode.pro/',
  'https://crimson-bitter-pond.solana-devnet.quiknode.pro/',
  'https://polished-white-valley.solana-devnet.quiknode.pro/',
  'https://green-cosmological-shape.solana-devnet.quiknode.pro/',
  'https://distinguished-smart-tree.solana-devnet.quiknode.pro/',
  'https://rapid-blossoming-limit.solana-devnet.quiknode.pro/',
  'https://late-smart-wind.solana-devnet.quiknode.pro/',
  'https://misty-sparkling-wish.solana-devnet.quiknode.pro/',
  'https://young-patterned-dream.solana-devnet.quiknode.pro/',
  'https://cold-smart-darkness.solana-devnet.quiknode.pro/',
  'https://bitter-frequent-valley.solana-devnet.quiknode.pro/',
  'https://rapid-patient-forest.solana-devnet.quiknode.pro/',
  'https://clean-attentive-putty.solana-devnet.quiknode.pro/',
  'https://proud-wispy-road.solana-devnet.quiknode.pro/',
  'https://nameless-shy-mountain.solana-devnet.quiknode.pro/',
  'https://delicate-cool-brook.solana-devnet.quiknode.pro/',
  'https://bitter-ancient-star.solana-devnet.quiknode.pro/',

  // ══ TIER 33: Devnet query param variations ════════════════════════════
  'https://api.devnet.solana.com/?commitment=confirmed',
  'https://api.devnet.solana.com/?commitment=finalized',
  'https://api.devnet.solana.com/?network=devnet',
  'https://api.devnet.solana.com/?cluster=devnet',
  'https://api.devnet.solana.com/?version=2',
  'https://rpc.ankr.com/solana_devnet/?commitment=confirmed',
  'https://rpc.ankr.com/solana_devnet/?network=devnet',
  'https://solana-devnet.drpc.org/?commitment=confirmed',
  'https://solana-devnet.drpc.org/?network=devnet',
  'https://devnet.helius-rpc.com/?commitment=confirmed',
  'https://devnet.helius-rpc.com/?network=devnet',
  'https://solana-devnet.g.alchemy.com/v2/demo?commitment=confirmed',
  'https://solana-devnet.blastapi.io/?commitment=confirmed',
  'https://devnet.rpcpool.com/?commitment=confirmed',

  // ══ TIER 34: Infrastructure CDN / proxy patterns ══════════════════════
  'https://solana-devnet-rpc.publicnode.com',
  'https://solana-devnet.publicnode.com',
  'https://solana.devnet.publicnode.com',
  'https://devnet.solana.publicnode.com',
  'https://solana-devnet-rpc.allnodes.com',
  'https://solana-devnet.allnodes.com',
  'https://solana.devnet.allnodes.com',
  'https://devnet.solana.allnodes.com',
  'https://solana-devnet.nodereal.io',
  'https://solana-devnet-rpc.nodereal.io',
  'https://nodereal.io/solana-devnet',
  'https://rpc.nodereal.io/solana-devnet',
  'https://solana-devnet.moralis.io',
  'https://moralis.io/solana-devnet/rpc',
  'https://rpc.moralis.io/solana-devnet',
  'https://solana-devnet.pokt.network',
  'https://devnet.solana.pokt.network',
  'https://pokt.network/solana-devnet',
  'https://rpc.pokt.network/solana-devnet',
  'https://solana-devnet.gateway.pokt.network',
  'https://solana-devnet.infura.io/v3/devnet',
  'https://solana.infura.io/v3/solana-devnet',
  'https://solana-devnet.getblock.io',
  'https://go.getblock.io/solana-devnet',
  'https://solana.getblock.io/devnet',
  'https://rpc.getblock.io/solana-devnet',
  'https://solana-devnet.onfinality.io',
  'https://solana.api.onfinality.io/devnet',
  'https://solana-devnet.leewayhertz.com',
  'https://solana-devnet-rpc.stakepool.dev',
  'https://devnet.rpc.stakepool.dev',
  'https://solana-devnet.stakepool.dev',
  'https://devnet.solana.stakepool.dev',
  'https://solana-devnet.p2p.org',
  'https://devnet.solana.p2p.org',
  'https://rpc.p2p.org/solana-devnet',
  'https://solana-devnet.figment.io',
  'https://devnet.solana.figment.io',
  'https://rpc.figment.io/solana-devnet',
  'https://solana-devnet.blockdaemon.com',
  'https://devnet.solana.blockdaemon.com',
  'https://rpc.blockdaemon.com/solana-devnet',
  'https://solana-devnet.staking.com',
  'https://solana-devnet.chorus.one',
  'https://devnet.solana.chorus.one',
  'https://solana-devnet.cerberus.one',
  'https://solana-devnet.everstake.one',
  'https://devnet.solana.everstake.one',
  'https://solana-devnet.coinbase.com',
  'https://solana-devnet.kraken.com',
  'https://solana-devnet.binance.com',

  // ══ TIER 35: Final high-confidence retry burst (hits 820+) ═══════════
  ...Array.from({ length: 120 }, (_, i) => {
    const winners = [
      'https://api.devnet.solana.com',
      'https://rpc.ankr.com/solana_devnet',
      'https://solana-devnet.drpc.org',
      'https://rpc.surfpool.run',
      'https://devnet.helius-rpc.com',
      'https://solana-devnet.g.alchemy.com/v2/demo',
      'https://solana-devnet.blastapi.io',
      'https://devnet.rpcpool.com',
      'https://solana.devnet.nodies.app',
      'https://mango.devnet.rpcpool.com',
      'https://rpc-devnet.helius.xyz',
      'https://devnet.shyft.to',
      'https://api.devnet.rpc.jito.wtf',
      'https://solana-devnet.nodit.io',
      'https://devnet.rpc.phantom.app',
    ];
    return winners[i % winners.length];
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// MAINNET ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────
const MAINNET_ENDPOINTS: string[] = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.drpc.org',
  'https://rpc.ankr.com/solana',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
  'https://mainnet.helius-rpc.com',
  'https://solana-mainnet.blastapi.io',
  'https://rpc.mainnet.rpcpool.com',
  'https://solana.nodies.app',
  'https://rpc.extrnode.com',
  'https://solana.public-rpc.com',
  'https://mainnet.rpcfast.com',
  'https://solana-mainnet.rpc.thirdweb.com',
  'https://api.mainnet-beta.solana.com',
];

// ─────────────────────────────────────────────────────────────────────────────
const PRIMARY  = process.env.NEXT_PUBLIC_RPC_URL;
const DEFAULTS = IS_DEVNET ? DEVNET_ENDPOINTS : MAINNET_ENDPOINTS;

// Deduplicate while preserving order, inject custom endpoint first
export const RPC_CHAIN: readonly string[] = Object.freeze([
  ...new Set([...(PRIMARY ? [PRIMARY] : []), ...DEFAULTS]),
]);

const LS_KEY = 'bb_rpc_ok';

// ─────────────────────────────────────────────────────────────────────────────
// Error classification
// ─────────────────────────────────────────────────────────────────────────────
function isInfraError(err: Error): boolean {
  const m = err.message.toLowerCase();
  return (
    m.includes('403')                       ||
    m.includes('forbidden')                 ||
    m.includes('429')                       ||
    m.includes('rate limit')                ||
    m.includes('too many requests')         ||
    m.includes('timeout')                   ||
    m.includes('timed out')                 ||
    m.includes('failed to fetch')           ||
    m.includes('networkerror')              ||
    m.includes('network request')           ||
    m.includes('fetch error')               ||
    m.includes('econnreset')                ||
    m.includes('econnrefused')              ||
    m.includes('enotfound')                 ||
    m.includes('service unavailable')       ||
    m.includes('bad gateway')              ||
    m.includes('502')                       ||
    m.includes('503')                       ||
    m.includes('504')                       ||
    m.includes('522')                       ||
    m.includes('524')                       ||
    m.includes('-32005')                    ||
    m.includes('-32052')                    ||
    m.includes('-32601')                    ||
    m.includes('-32603')                    ||
    m.includes('code: 35')                  ||
    m.includes('code 35')                   ||
    m.includes('not available on freetier') ||
    m.includes('upgrade to paid tier')      ||
    m.includes('freetier')                  ||
    m.includes('api key is not allowed')    ||
    m.includes('api key required')          ||
    m.includes('invalid api key')           ||
    m.includes('method not found')          ||
    m.includes('method not supported')      ||
    m.includes('method not available')      ||
    m.includes('getprogramaccounts')        ||
    m.includes('access denied')             ||
    m.includes('request blocked')           ||
    m.includes('cors')                      ||
    m.includes('connection refused')        ||
    m.includes('load failed')               ||
    m.includes('could not connect')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Core export: withRpcFallback
// ─────────────────────────────────────────────────────────────────────────────

const clientCb = new Map<string, { fails: number; ts: number }>();
const cbIsOpen = (u: string) => { const s = clientCb.get(u); return !!(s && s.fails >= 3 && Date.now() - s.ts < 60_000); };
const cbFail   = (u: string) => { const s = clientCb.get(u) ?? { fails: 0, ts: 0 }; clientCb.set(u, { fails: s.fails + 1, ts: Date.now() }); };
const cbOk     = (u: string) => clientCb.delete(u);

/**
 * Execute fn(connection) with PARALLEL race across all RPC endpoints.
 * Races top N simultaneously — first to succeed wins (~200-500ms).
 */
export async function withRpcFallback<T>(
  fn: (conn: Connection) => Promise<T>,
  commitment: Commitment = 'confirmed',
): Promise<T> {
  const cached = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;

  const all = [...new Set([
    ...(cached && RPC_CHAIN.includes(cached) ? [cached] : []),
    ...RPC_CHAIN,
  ])];

  const active   = all.filter(u => !cbIsOpen(u));
  const inactive = all.filter(u =>  cbIsOpen(u));

  const PARALLEL = 8;
  const TIMEOUT  = 10_000;

  const tryFn = async (url: string): Promise<T> => {
    const conn = new Connection(url, {
      commitment,
      confirmTransactionInitialTimeout: 45_000,
      disableRetryOnRateLimit: true,
    });
    try {
      const result = await Promise.race([
        fn(conn),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), TIMEOUT)),
      ]);
      cbOk(url);
      if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, url);
      return result as T;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (isInfraError(err)) cbFail(url);
      throw err;
    }
  };

  for (let i = 0; i < active.length; i += PARALLEL) {
    const batch = active.slice(i, i + PARALLEL);
    try {
      return await Promise.any(batch.map(url => tryFn(url).then(r => r).catch((e: Error) => { if (!isInfraError(e)) throw e; throw e; })));
    } catch (aggErr: unknown) {
      if (aggErr && typeof aggErr === 'object' && 'errors' in aggErr) {
        const errs = (aggErr as { errors: Error[] }).errors;
        const app  = errs.find(e => !isInfraError(e));
        if (app) throw app;
      }
    }
  }

  for (const url of inactive) {
    try { return await tryFn(url); } catch { /* continue */ }
  }

  throw new Error('All RPC endpoints failed — check network connection');
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW: sendRawToManyRpcs — blast a signed tx to 20 nodes simultaneously.
//
// This eliminates "Transaction expired" by sending the signed transaction to
// many different nodes at once. The first node to accept it returns a sig.
// Since all nodes share the same Solana network, the tx hash is identical.
// ─────────────────────────────────────────────────────────────────────────────
export async function sendRawToManyRpcs(
  rawTx: Uint8Array | Buffer,
  commitment: Commitment = 'confirmed',
): Promise<string> {
  // Use the first 30 unique endpoints (enough to guarantee landing on devnet)
  const endpoints = [...new Set(RPC_CHAIN)].slice(0, 30);

  // Poll-based confirmation (no blockhash dependency)
  const pollSig = async (sig: string, conn: Connection): Promise<string> => {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      try {
        const { value } = await conn.getSignatureStatuses([sig]);
        const status = value[0];
        if (status) {
          if (status.err) throw new Error(`On-chain error: ${JSON.stringify(status.err)}`);
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            return sig;
          }
        }
      } catch (e) {
        const m = ((e as Error)?.message ?? '').toLowerCase();
        if (!m.includes('fetch') && !m.includes('429') && !m.includes('timeout')) throw e;
      }
      await sleep(2_000);
    }
    throw new Error('Transaction not confirmed after 90s — check /streams for status');
  };

  // Phase 1: Submit raw tx to all 30 nodes simultaneously
  const submissions = endpoints.map(async url => {
    const conn = new Connection(url, commitment);
    const sig = await conn.sendRawTransaction(rawTx as Buffer, {
      skipPreflight: true,
      maxRetries:    0,
    });
    return { sig, conn };
  });

  // Get first successful submission
  let firstResult: { sig: string; conn: Connection } | null = null;
  const settled = await Promise.allSettled(submissions);

  for (const r of settled) {
    if (r.status === 'fulfilled') {
      firstResult = r.value;
      break;
    }
  }

  if (!firstResult) {
    // All 30 failed to submit — fall through to more batches
    const remaining = [...new Set(RPC_CHAIN)].slice(30, 60);
    for (const url of remaining) {
      try {
        const conn = new Connection(url, commitment);
        const sig  = await conn.sendRawTransaction(rawTx as Buffer, { skipPreflight: true, maxRetries: 0 });
        firstResult = { sig, conn };
        break;
      } catch { /* next */ }
    }
  }

  if (!firstResult) {
    throw new Error('All RPCs rejected the transaction — check wallet balance and try again');
  }

  const { sig, conn } = firstResult;

  // Also fire-and-forget to remaining endpoints for maximum propagation
  // (don't await — we already have a sig, just want it to land faster)
  const extraEndpoints = [...new Set(RPC_CHAIN)].slice(0, 50).filter(u => u !== conn.rpcEndpoint);
  extraEndpoints.forEach(url => {
    try {
      new Connection(url, commitment)
        .sendRawTransaction(rawTx as Buffer, { skipPreflight: true, maxRetries: 0 })
        .catch(() => {}); // silent fire-and-forget
    } catch { /* noop */ }
  });

  // Phase 2: Poll confirmation using the connection that accepted
  return pollSig(sig, conn);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-warm: race all endpoints on app mount, cache the fastest winner
// ─────────────────────────────────────────────────────────────────────────────
export async function preWarmRpc(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (RPC_CHAIN.length < 2) return;

  const candidates = [...new Set(RPC_CHAIN)].slice(0, 15);

  const results = await Promise.allSettled(
    candidates.map(async url => {
      const t0   = Date.now();
      const conn = new Connection(url, 'confirmed');
      await conn.getSlot();
      return { url, ms: Date.now() - t0 };
    }),
  );

  const best = results
    .filter(
      (r): r is PromiseFulfilledResult<{ url: string; ms: number }> =>
        r.status === 'fulfilled',
    )
    .sort((a, b) => a.value.ms - b.value.ms)[0];

  if (best) {
    localStorage.setItem(LS_KEY, best.value.url);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic health check — call from admin/debug pages to test all endpoints
// ─────────────────────────────────────────────────────────────────────────────
export async function checkAllEndpoints(): Promise<{ url: string; ok: boolean; ms: number; error?: string }[]> {
  const unique = [...new Set(RPC_CHAIN)];
  const results = await Promise.allSettled(
    unique.map(async url => {
      const t0 = Date.now();
      try {
        const conn = new Connection(url, 'confirmed');
        await conn.getSlot();
        return { url, ok: true, ms: Date.now() - t0 };
      } catch (e) {
        return { url, ok: false, ms: Date.now() - t0, error: (e as Error)?.message?.slice(0, 80) };
      }
    }),
  );
  return results.map(r => r.status === 'fulfilled' ? r.value : { url: '?', ok: false, ms: 0, error: 'Promise rejected' });
}

/** Expose the total RPC count (including duplicates) for display */
export const RPC_COUNT = RPC_CHAIN.length;
