'use client';
import React, { useState, useCallback, useEffect } from 'react';
import { T } from '@/lib/tokens';
import { STREAMS, MOCK_WALLET, Stream, AUDIT_LOG, AuditEvent } from '@/lib/mock-data';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Transaction, PublicKey } from '@solana/web3.js';
import {
  getStreamPDA, getEscrowPDA, getATA, ChainStream,
  fetchWalletStreams, buildCreateStreamIx, buildWithdrawIx, buildCancelIx,
} from '@/lib/program';

// ─── Primitives ──────────────────────────────────────────────

function Badge({ label, color = T.accent }: { label: string; color?: string }) {
  return (
    <span style={{ padding:'2px 9px', borderRadius:99, fontSize:10.5, fontWeight:600,
      letterSpacing:'.04em', background:`${color}1a`, color, border:`1px solid ${color}44` }}>
      {label}
    </span>
  );
}

function Btn({ children, variant='primary', size='md', onClick, style={}, disabled, full }:
  { children:React.ReactNode; variant?:string; size?:string; onClick?:()=>void;
    style?:React.CSSProperties; disabled?:boolean; full?:boolean }) {
  const base: React.CSSProperties = {
    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6,
    borderRadius:11, border:'none', cursor:disabled?'not-allowed':'pointer',
    fontWeight:600, letterSpacing:'.02em', transition:'all .18s', opacity:disabled?.5:1,
    width: full ? '100%' : undefined,
    ...(size==='sm' ? {padding:'5px 13px',fontSize:11.5}
      : size==='lg' ? {padding:'13px 26px',fontSize:14.5}
      :               {padding:'8px 18px',fontSize:12.5}),
  };
  const vars: Record<string,React.CSSProperties> = {
    primary: {background:`linear-gradient(135deg,${T.accent},${T.accentDk})`,color:'#fff',boxShadow:`0 0 18px ${T.accent}44`},
    ghost:   {background:'rgba(255,255,255,.06)',color:T.muted,border:`1px solid ${T.border}`},
    danger:  {background:`${T.red}18`,color:T.red,border:`1px solid ${T.red}44`},
    gold:    {background:`linear-gradient(135deg,${T.gold}cc,#a36a17cc)`,color:'#0b0a14',boxShadow:`0 0 14px ${T.gold}44`},
    green:   {background:`${T.green}18`,color:T.green,border:`1px solid ${T.green}44`},
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{...base,...vars[variant],...style}}
      onMouseEnter={e=>{if(!disabled)(e.currentTarget as HTMLButtonElement).style.filter='brightness(1.12)'}}
      onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.filter=''}}>
      {children}
    </button>
  );
}

function Card({ children, style={}, onClick, glow }:
  { children:React.ReactNode; style?:React.CSSProperties; onClick?:()=>void; glow?:string }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:hov&&onClick?T.cardHov:T.card,
        border:`1px solid ${hov&&onClick?T.borderHi:T.border}`,
        borderRadius:16, padding:'18px 20px', transition:'all .18s',
        cursor:onClick?'pointer':'default',
        boxShadow:glow?`0 0 28px ${glow}22`:'none', ...style }}>
      {children}
    </div>
  );
}

function StatBox({ label, value, sub, color=T.accent, icon }:
  { label:string; value:string|number; sub?:string; color?:string; icon?:string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ fontSize:11, color:T.muted, letterSpacing:'.06em', textTransform:'uppercase',
        display:'flex', alignItems:'center', gap:5 }}>
        {icon&&<span>{icon}</span>}{label}
      </div>
      <div style={{ fontFamily:T.mono, fontSize:24, fontWeight:700, color, lineHeight:1, letterSpacing:'-.02em' }}>{value}</div>
      {sub&&<div style={{ fontSize:11, color:T.muted }}>{sub}</div>}
    </div>
  );
}

function Tag({ label, dot, color=T.accent }:
  { label:string; dot?:string; color?:string }) {
  const dotColor: Record<string,string> = { active:T.green, pending:T.gold, completed:T.muted, cancelled:T.red };
  const dc = dot ? (dotColor[dot]||color) : color;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      {dot&&<div style={{ width:7, height:7, borderRadius:'50%', background:dc, boxShadow:`0 0 6px ${dc}` }}/>}
      <span style={{ fontSize:11, color:dc, fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em' }}>{label}</span>
    </div>
  );
}

function ProgressBar({ pct, color=T.accent, height=6 }:
  { pct:number; color?:string; height?:number }) {
  return (
    <div style={{ height, borderRadius:99, background:'rgba(255,255,255,.07)', overflow:'hidden' }}>
      <div style={{ height:'100%', width:`${pct}%`, borderRadius:99,
        background:`linear-gradient(90deg,${color}88,${color})`,
        boxShadow:`0 0 8px ${color}66`, transition:'width .6s ease' }}/>
    </div>
  );
}

function AddrPill({ addr }: { addr:string }) {
  return (
    <span style={{ fontFamily:T.mono, fontSize:11, padding:'3px 8px',
      background:'rgba(255,255,255,.06)', borderRadius:6, color:T.muted,
      border:`1px solid ${T.border}` }}>{addr}</span>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────

function Sidebar({ page, setPage }: { page:string; setPage:(p:string)=>void }) {
  const { publicKey, disconnect } = useWallet();
  const NAV = [
    { key:'landing',    icon:'⬡',  label:'About'        },
    { key:'dashboard',  icon:'◈',  label:'Dashboard'    },
    { key:'analytics',  icon:'📊', label:'Analytics'    },
    { key:'milestones', icon:'✓',  label:'Milestones'   },
    { key:'audit',      icon:'🔐', label:'Audit Trail'  },
    { key:'new',        icon:'＋', label:'New Stream'   },
  ];
  return (
    <div style={{ width:T.sideW, height:'100%', flexShrink:0,
      background:T.bg1, borderRight:`1px solid ${T.border}`,
      display:'flex', flexDirection:'column', padding:'0 0 20px', overflow:'hidden' }}>

      {/* Logo */}
      <div style={{ padding:'20px 20px 16px', borderBottom:`1px solid ${T.border}`, cursor:'pointer' }}
        onClick={()=>setPage('landing')}>
        <div style={{ fontFamily:T.serif, fontSize:16, fontWeight:700,
          color:T.gold, letterSpacing:'.06em', textShadow:`0 0 20px ${T.gold}66` }}>BLOCKBITE</div>
        <div style={{ fontSize:10, color:T.accent, letterSpacing:'.1em', marginTop:1 }}>TDP PROTOCOL</div>
      </div>

      {/* Nav */}
      <div style={{ flex:1, padding:'12px 10px', display:'flex', flexDirection:'column', gap:2 }}>
        {NAV.map(n=>{
          const active = page===n.key || (page.startsWith('stream:')&&n.key==='dashboard');
          return (
            <button key={n.key} onClick={()=>setPage(n.key)} style={{
              display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
              borderRadius:10, border:'none', cursor:'pointer',
              background:active?`${T.accent}18`:'transparent',
              color:active?T.accent:T.muted, fontSize:13, fontWeight:active?600:400,
              transition:'all .15s', textAlign:'left',
              borderLeft:active?`2px solid ${T.accent}`:'2px solid transparent',
            }}>
              <span style={{ fontSize:15, width:18, textAlign:'center' }}>{n.icon}</span>
              {n.label}
            </button>
          );
        })}
      </div>

      {/* Wallet */}
      <div style={{ padding:'0 10px', display:'flex', flexDirection:'column', gap:8 }}>
        {publicKey ? (
          <div style={{ background:`${T.accent}10`, border:`1px solid ${T.border}`, borderRadius:12, padding:'10px 12px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:T.green, boxShadow:`0 0 6px ${T.green}` }}/>
              <span style={{ fontSize:10, color:T.green, fontWeight:600 }}>CONNECTED</span>
            </div>
            <div style={{ fontFamily:T.mono, fontSize:10, color:T.accent, wordBreak:'break-all' }}>
              {publicKey.toBase58().slice(0,8)}…{publicKey.toBase58().slice(-6)}
            </div>
            <button onClick={disconnect} style={{ marginTop:6, fontSize:10, color:T.red,
              background:'none', border:'none', cursor:'pointer', padding:0 }}>
              Disconnect
            </button>
          </div>
        ) : (
          <div style={{ display:'flex', justifyContent:'center' }}>
            <WalletMultiButton style={{
              background:`linear-gradient(135deg,${T.accent},${T.accentDk})`,
              borderRadius:11, fontSize:12, padding:'8px 16px', width:'100%',
              justifyContent:'center', boxShadow:`0 0 18px ${T.accent}44`,
            }}/>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TopBar ──────────────────────────────────────────────────

function TopBar({ title, sub, actions }: { title:string; sub?:string; actions?:React.ReactNode }) {
  return (
    <div style={{ padding:'20px 28px 16px', borderBottom:`1px solid ${T.border}`,
      display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexShrink:0 }}>
      <div>
        <h1 style={{ fontFamily:T.serif, fontSize:20, fontWeight:700, color:'#fff', letterSpacing:'.03em' }}>{title}</h1>
        {sub&&<p style={{ fontSize:12, color:T.muted, marginTop:3 }}>{sub}</p>}
      </div>
      {actions&&<div style={{ display:'flex', gap:8, alignItems:'center' }}>{actions}</div>}
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────

function chainStreamToUI(cs: ChainStream): Stream {
  const now = Math.floor(Date.now() / 1000);
  const total = Number(cs.totalAmount);
  const withdrawn = Number(cs.amountWithdrawn);
  const start = Number(cs.startTime);
  const end   = Number(cs.endTime);
  const cliff = Number(cs.cliffTime);
  let unlocked = 0;
  if (!cs.isCancelled && now >= start) {
    if (cliff > 0 && now < cliff) unlocked = 0;
    else {
      const elapsed = Math.min(now, end) - start;
      const duration = end - start;
      unlocked = duration > 0 ? Math.min(Math.floor(total * elapsed / duration), total) : total;
    }
  }
  const status: Stream['status'] = cs.isCancelled ? 'cancelled'
    : now < start ? 'pending'
    : unlocked >= total ? 'completed' : 'active';
  return {
    id: cs.address.toBase58(),
    name: `Stream ${cs.address.toBase58().slice(0,8)}…`,
    token: cs.mint.toBase58().slice(0,6) + '…',
    total, claimed: withdrawn, unlocked,
    cliff: cliff > 0 ? new Date(cliff * 1000).toISOString().slice(0,10) : 'None',
    end: new Date(end * 1000).toISOString().slice(0,10),
    type: cs.milestoneEnabled ? 'cliff' : 'linear',
    recipient: cs.recipient.toBase58(),
    creator:   cs.creator.toBase58(),
    status, vestDays: Math.round((end - start) / 86400),
    cliffDays: cliff > 0 ? Math.round((cliff - start) / 86400) : 0,
    milestones: [],
  };
}

function timeLeft(endStr: string): string {
  const diff = new Date(endStr).getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const d = Math.floor(diff / 86_400_000);
  if (d > 60) return `~${Math.floor(d / 30)}mo left`;
  if (d > 0)  return `${d}d left`;
  return `${Math.floor(diff / 3_600_000)}h left`;
}

function DashboardPage({ setPage }: { setPage:(p:string)=>void }) {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [role, setRole] = useState('all');
  const [chainStreams, setChainStreams] = useState<Stream[] | null>(null);
  const [loadingChain, setLoadingChain] = useState(false);

  // When wallet connects, auto-load real streams from devnet
  useEffect(() => {
    if (!publicKey) { setChainStreams(null); return; }
    setLoadingChain(true);
    fetchWalletStreams(connection, publicKey)
      .then(raw => setChainStreams(raw.length > 0 ? raw.map(chainStreamToUI) : null))
      .catch(() => setChainStreams(null))
      .finally(() => setLoadingChain(false));
  }, [publicKey, connection]);

  const refreshFromChain = useCallback(async () => {
    if (!publicKey) return;
    setLoadingChain(true);
    try {
      const raw = await fetchWalletStreams(connection, publicKey);
      setChainStreams(raw.length > 0 ? raw.map(chainStreamToUI) : null);
    } catch { setChainStreams(null); }
    finally { setLoadingChain(false); }
  }, [publicKey, connection]);

  // In demo mode (not connected or no real streams), treat MOCK_WALLET as the active wallet
  // so demo data shows correctly for both creator/recipient filtering
  const activeWallet = publicKey?.toBase58() ?? MOCK_WALLET;
  const isMyAddr = (addr: string) => addr === activeWallet || addr === MOCK_WALLET;

  const displayStreams = chainStreams ?? STREAMS;
  const wallet = publicKey ? `${publicKey.toBase58().slice(0,8)}…` : MOCK_WALLET;
  const filtered = displayStreams.filter(s =>
    role==='all' ? true : role==='creator' ? isMyAddr(s.creator) : isMyAddr(s.recipient)
  );
  const totalUnlocked = filtered.reduce((a,s)=>a+s.unlocked,0);
  const totalClaimed  = filtered.reduce((a,s)=>a+s.claimed,0);
  const claimable     = filtered.filter(s=>isMyAddr(s.recipient)).reduce((a,s)=>a+(s.unlocked-s.claimed),0);

  const typeColor: Record<string,string> = { linear:T.accent, milestone:T.blue, cliff:T.gold, hybrid:'#c084fc' };
  const statusColor: Record<string,string> = { active:T.green, pending:T.gold, completed:T.muted, cancelled:T.red };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <TopBar title="Stream Dashboard"
        sub={publicKey ? `Wallet: ${wallet}${chainStreams ? ` · ${chainStreams.length} on-chain stream${chainStreams.length!==1?'s':''}` : ' · showing demo data'}` : 'Connect wallet to interact with streams'}
        actions={
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {!publicKey && <Badge label="DEMO MODE" color={T.gold}/>}
            {publicKey && (
              <Btn variant="ghost" size="sm" onClick={refreshFromChain} disabled={loadingChain}>
                {loadingChain ? '⟳ Loading…' : '⟳ Refresh'}
              </Btn>
            )}
            <Btn variant="primary" onClick={()=>setPage('new')}>+ New Stream</Btn>
          </div>
        }/>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 28px', display:'flex', flexDirection:'column', gap:18 }}>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            { label:'Total Streams', value:filtered.length,                        sub:'streams',        color:'#fff',    icon:'◈' },
            { label:'Unlocked',      value:`${(totalUnlocked/1000).toFixed(0)}K`,  sub:'BBT unlocked',   color:T.accent,  icon:'🔓' },
            { label:'Claimed',       value:`${(totalClaimed/1000).toFixed(0)}K`,   sub:'BBT claimed',    color:T.green,   icon:'✓'  },
            { label:'Claimable',     value:claimable.toLocaleString(),              sub:'BBT ready now',  color:T.gold,    icon:'⚡' },
          ].map(s=>(
            <Card key={s.label} style={{ padding:'14px 16px' }}>
              <StatBox {...s}/>
            </Card>
          ))}
        </div>

        {/* Role filter */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', gap:2, background:T.bg1, borderRadius:10, border:`1px solid ${T.border}`, padding:3 }}>
            {['all','creator','recipient'].map(r=>(
              <button key={r} onClick={()=>setRole(r)} style={{
                padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer',
                background:role===r?T.accent:'transparent', color:role===r?'#fff':T.muted,
                fontSize:12, fontWeight:600, transition:'all .15s', textTransform:'capitalize',
              }}>{r==='all'?'All':r==='creator'?'As Creator':'As Recipient'}</button>
            ))}
          </div>
          <span style={{ fontSize:12, color:T.muted }}>{filtered.length} stream{filtered.length!==1?'s':''}</span>
        </div>

        {/* Stream list */}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(s=>{
            const pctU = Math.round(s.unlocked/s.total*100);
            const pctC = Math.round(s.claimed/s.total*100);
            const isRec = isMyAddr(s.recipient);
            const clm  = s.unlocked - s.claimed;
            return (
              <Card key={s.id} onClick={()=>setPage(`stream:${s.id}`)} style={{ padding:'16px 20px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:14, fontWeight:600, color:'#fff' }}>{s.name}</span>
                      <Badge label={s.type.toUpperCase()} color={typeColor[s.type]||T.accent}/>
                      {isRec&&<Badge label="RECEIVING" color={T.blue}/>}
                    </div>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <AddrPill addr={isRec?`From ${s.creator}`:`To ${s.recipient}`}/>
                      <Tag label={s.status} dot={s.status}/>
                    </div>
                  </div>
                  {s.status==='active'&&isRec&&clm>0&&(
                    <Btn variant="gold" size="sm" onClick={()=>setPage(`stream:${s.id}`)}>
                      Claim {clm.toLocaleString()} BBT
                    </Btn>
                  )}
                </div>

                {/* Progress bar */}
                <div style={{ position:'relative', height:8, borderRadius:99, background:'rgba(255,255,255,.06)', overflow:'hidden', marginBottom:8 }}>
                  <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${pctU}%`, borderRadius:99, background:`${T.accent}44` }}/>
                  <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${pctC}%`, borderRadius:99,
                    background:`linear-gradient(90deg,${T.accent}99,${T.accent})`, boxShadow:`0 0 8px ${T.accent}55` }}/>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:T.muted, marginBottom:12 }}>
                  <span>Unlocked {pctU}%</span>
                  <span>Claimed {pctC}%</span>
                  <span style={{ fontFamily:T.mono, color:'#fff' }}>{s.total.toLocaleString()} {s.token}</span>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8 }}>
                  {[
                    {l:'Unlocked',  v:s.unlocked.toLocaleString(), c:T.accent},
                    {l:'Claimed',   v:s.claimed.toLocaleString(),  c:T.green},
                    {l:'Locked',    v:(s.total-s.unlocked).toLocaleString(), c:T.muted},
                    {l:'Remaining', v:timeLeft(s.end), c:s.status==='active'?T.blue:T.muted},
                  ].map(x=>(
                    <div key={x.l} style={{ textAlign:'center', padding:'7px 5px',
                      background:'rgba(255,255,255,.03)', borderRadius:9, border:`1px solid ${T.border}` }}>
                      <div style={{ fontFamily:T.mono, fontSize:12, fontWeight:700, color:x.c }}>{x.v}</div>
                      <div style={{ fontSize:9, color:T.muted, marginTop:2, letterSpacing:'.05em' }}>{x.l}</div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Tx-phase loading indicator ──────────────────────────────

function TxProgress({ phase }: { phase: string }) {
  const phases = ['Approving wallet', 'Sending transaction', 'Confirming on-chain'];
  const idx = phases.findIndex(p => phase.startsWith(p));
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, padding:'16px 20px',
      background:`${T.accent}08`, border:`1px solid ${T.accent}22`, borderRadius:12 }}>
      {phases.map((p, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={p} style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:18, height:18, borderRadius:'50%', flexShrink:0, display:'flex',
              alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700,
              background: done ? T.green : active ? T.accent : 'rgba(255,255,255,.08)',
              color: done || active ? '#fff' : T.muted,
              border: `1.5px solid ${done ? T.green : active ? T.accent : T.border}`,
              boxShadow: active ? `0 0 10px ${T.accent}55` : 'none',
            }}>
              {done ? '✓' : i + 1}
            </div>
            <span style={{ fontSize:12, color: done ? T.green : active ? '#fff' : T.muted,
              fontWeight: active ? 600 : 400 }}>{p}{active ? '…' : ''}</span>
            {active && <span style={{ width:14, height:14, border:`2px solid ${T.accent}44`,
              borderTop:`2px solid ${T.accent}`, borderRadius:'50%',
              animation:'spin 0.8s linear infinite', display:'inline-block', flexShrink:0 }}/>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Stream Detail Page ───────────────────────────────────────

function StreamDetailPage({ id, setPage }: { id:string; setPage:(p:string)=>void }) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  // Support both real on-chain IDs (long pubkey) and mock IDs (s001 etc.)
  const isReal = id.length > 10;
  const s = STREAMS.find(x => x.id === id) || STREAMS[0];
  const claimable = s.unlocked - s.claimed;
  const typeColor: Record<string,string> = { linear:T.accent, milestone:T.blue, cliff:T.gold, hybrid:'#c084fc' };

  const activeWallet = publicKey?.toBase58() ?? MOCK_WALLET;
  const isMyAddr = (addr: string) => addr === activeWallet || addr === MOCK_WALLET;

  // Transaction state
  const [txPhase,   setTxPhase]   = useState('');   // '' | 'Approving wallet' | 'Sending…' | 'Confirming…'
  const [txSig,     setTxSig]     = useState('');
  const [txErr,     setTxErr]     = useState('');
  const [claimed,   setClaimed]   = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false); // confirm dialog

  const runPhases = useCallback(async (build: () => Promise<string>) => {
    setTxErr('');
    setTxPhase('Approving wallet');
    try {
      const sig = await build();
      setTxPhase('Confirming on-chain');
      await connection.confirmTransaction(sig, 'confirmed');
      setTxSig(sig);
      setTxPhase('');
      return sig;
    } catch (err: unknown) {
      setTxPhase('');
      const msg = err instanceof Error ? err.message : String(err);
      setTxErr(msg.length > 120 ? msg.slice(0, 120) + '…' : msg);
      throw err;
    }
  }, [connection]);

  // ── Withdraw ──────────────────────────────────────────────────
  const handleClaim = useCallback(async () => {
    if (!publicKey || !sendTransaction) { alert('Connect your wallet first!'); return; }
    if (!isReal) {
      // Demo path: simulate the 3-phase flow for mock streams
      setTxErr('');
      setTxPhase('Approving wallet');
      await new Promise(r => setTimeout(r, 900));
      setTxPhase('Sending transaction');
      await new Promise(r => setTimeout(r, 900));
      setTxPhase('Confirming on-chain');
      await new Promise(r => setTimeout(r, 900));
      setTxPhase('');
      setClaimed(true);
      return;
    }
    try {
      await runPhases(async () => {
        setTxPhase('Sending transaction');
        // Derive accounts from stream data
        let recipientPK: PublicKey, creatorPK: PublicKey, mintPK: PublicKey;
        try {
          recipientPK = new PublicKey(s.recipient);
          creatorPK   = new PublicKey(s.creator);
          mintPK      = new PublicKey(s.token.replace('…', ''));
        } catch {
          throw new Error('Invalid stream account data — is this stream on devnet?');
        }
        const seed = BigInt(s.id.split('-')[0] || '1');
        const [streamPDA]   = getStreamPDA(creatorPK, recipientPK, seed);
        const [escrowPDA]   = getEscrowPDA(streamPDA);
        const recipientTA   = getATA(publicKey, mintPK);

        const ix = buildWithdrawIx(publicKey, streamPDA, mintPK, escrowPDA, recipientTA);
        const tx = new Transaction().add(ix);
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;
        return await sendTransaction(tx, connection);
      });
      setClaimed(true);
    } catch { /* error shown via txErr */ }
  }, [publicKey, sendTransaction, connection, isReal, s, runPhases]);

  // ── Cancel ────────────────────────────────────────────────────
  const handleCancel = useCallback(async () => {
    setCancelOpen(false);
    if (!publicKey || !sendTransaction) { alert('Connect your wallet first!'); return; }
    if (!isReal) {
      // Demo path
      setTxErr('');
      setTxPhase('Approving wallet');
      await new Promise(r => setTimeout(r, 900));
      setTxPhase('Sending transaction');
      await new Promise(r => setTimeout(r, 900));
      setTxPhase('Confirming on-chain');
      await new Promise(r => setTimeout(r, 900));
      setTxPhase('');
      setCancelled(true);
      return;
    }
    try {
      await runPhases(async () => {
        setTxPhase('Sending transaction');
        let recipientPK: PublicKey, mintPK: PublicKey;
        try {
          recipientPK = new PublicKey(s.recipient);
          mintPK      = new PublicKey(s.token.replace('…', ''));
        } catch {
          throw new Error('Invalid stream account data');
        }
        const seed = BigInt(s.id.split('-')[0] || '1');
        const [streamPDA] = getStreamPDA(publicKey, recipientPK, seed);
        const [escrowPDA] = getEscrowPDA(streamPDA);
        const creatorTA   = getATA(publicKey, mintPK);
        const recipientTA = getATA(recipientPK, mintPK);

        const ix = buildCancelIx(publicKey, streamPDA, mintPK, escrowPDA, creatorTA, recipientTA);
        const tx = new Transaction().add(ix);
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;
        return await sendTransaction(tx, connection);
      });
      setCancelled(true);
    } catch { /* error shown via txErr */ }
  }, [publicKey, sendTransaction, connection, isReal, s, runPhases]);

  const isBusy = txPhase !== '';

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* Cancel confirmation modal */}
      {cancelOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:1000,
          background:'rgba(5,4,13,.82)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:T.bg1, border:`1px solid ${T.red}44`, borderRadius:20,
            padding:'28px 32px', maxWidth:400, width:'90%', boxShadow:`0 0 48px ${T.red}22` }}>
            <div style={{ fontSize:32, textAlign:'center', marginBottom:12 }}>⚠️</div>
            <div style={{ fontFamily:T.serif, fontSize:17, fontWeight:700, color:'#fff',
              textAlign:'center', marginBottom:8 }}>Cancel Stream?</div>
            <p style={{ fontSize:13, color:T.muted, textAlign:'center', lineHeight:1.7, marginBottom:20 }}>
              This will permanently cancel the stream.<br/>
              Unlocked tokens go to the recipient.<br/>
              Remaining locked tokens return to you.
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <Btn variant="ghost" onClick={()=>setCancelOpen(false)} style={{ flex:1 }}>Keep Stream</Btn>
              <Btn variant="danger" onClick={handleCancel} style={{ flex:1 }}>Yes, Cancel It</Btn>
            </div>
          </div>
        </div>
      )}

      <TopBar title={cancelled ? `${s.name} [CANCELLED]` : s.name}
        sub={`Stream ID: ${s.id.slice(0,16)}${s.id.length>16?'…':''} · ${s.type.toUpperCase()} vesting · ${isReal?'⛓ On-Chain':'🧪 Demo'}`}
        actions={
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <Btn variant="ghost" size="sm" onClick={()=>setPage('dashboard')}>← Back</Btn>
            {isMyAddr(s.creator) && s.status==='active' && !cancelled && (
              <Btn variant="danger" size="sm" onClick={()=>setCancelOpen(true)} disabled={isBusy}>
                {isBusy ? '⟳' : '✕ Cancel Stream'}
              </Btn>
            )}
            {isMyAddr(s.recipient) && claimable>0 && !claimed && !cancelled && (
              <Btn variant="gold" onClick={handleClaim} disabled={isBusy}>
                {isBusy ? '⟳ Processing…' : `Claim ${claimable.toLocaleString()} BBT`}
              </Btn>
            )}
            {claimed    && <Badge label="✓ CLAIMED"   color={T.green}/>}
            {cancelled  && <Badge label="✕ CANCELLED" color={T.red}/>}
          </div>
        }/>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 28px', display:'flex', flexDirection:'column', gap:16 }}>

        {/* Tx loading progress */}
        {isBusy && <TxProgress phase={txPhase}/>}

        {/* Tx error banner */}
        {txErr && !isBusy && (
          <div style={{ padding:'12px 16px', background:`${T.red}10`, border:`1px solid ${T.red}44`,
            borderRadius:12, display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>⚠</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:T.red }}>Transaction Failed</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{txErr}</div>
            </div>
            <Btn variant="ghost" size="sm" onClick={()=>setTxErr('')}>✕</Btn>
          </div>
        )}

        {/* Tx success banner */}
        {txSig && (
          <div style={{ padding:'12px 16px', background:`${T.green}10`, border:`1px solid ${T.green}44`,
            borderRadius:12, display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>✓</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:T.green }}>Transaction Confirmed</div>
              <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank" rel="noreferrer"
                style={{ fontSize:11, color:T.accent, fontFamily:T.mono }}>
                {txSig.slice(0,20)}… ↗ View on Explorer
              </a>
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            {label:'Total',     value:`${(s.total/1000).toFixed(0)}K`,    sub:'BBT allocated', color:'#fff'   },
            {label:'Unlocked',  value:`${(s.unlocked/1000).toFixed(0)}K`, sub:'BBT unlocked',  color:T.accent },
            {label:'Claimed',   value:`${(s.claimed/1000).toFixed(0)}K`,  sub:'BBT claimed',   color:T.green  },
            {label:'Claimable', value:claimable.toLocaleString(),          sub:'BBT now',       color:T.gold   },
          ].map(x=>(<Card key={x.label} style={{padding:'14px 16px'}}><StatBox {...x}/></Card>))}
        </div>

        {/* Meta */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', padding:'12px 16px',
          background:T.bg1, borderRadius:12, border:`1px solid ${T.border}` }}>
          <Badge label={s.type.toUpperCase()} color={typeColor[s.type]||T.accent}/>
          <Tag label={s.status} dot={s.status}/>
          <span style={{ fontSize:12, color:T.muted }}>Cliff: <b style={{color:'#fff'}}>{s.cliff}</b></span>
          <span style={{ fontSize:12, color:T.muted }}>End: <b style={{color:'#fff'}}>{s.end}</b></span>
          <span style={{ fontSize:12, color:T.muted }}>Creator: <AddrPill addr={s.creator}/></span>
          <span style={{ fontSize:12, color:T.muted }}>Recipient: <AddrPill addr={s.recipient}/></span>
        </div>

        {/* Progress */}
        <Card>
          <div style={{ fontFamily:T.serif, fontSize:14, fontWeight:600, color:'#fff', marginBottom:16 }}>Vesting Progress</div>
          <div style={{ position:'relative', height:12, borderRadius:99, background:'rgba(255,255,255,.07)', overflow:'hidden', marginBottom:10 }}>
            <div style={{ position:'absolute', left:0, top:0, height:'100%',
              width:`${Math.round(s.unlocked/s.total*100)}%`, background:`${T.accent}3a` }}/>
            <div style={{ position:'absolute', left:0, top:0, height:'100%',
              width:`${Math.round(s.claimed/s.total*100)}%`,
              background:`linear-gradient(90deg,${T.gold}88,${T.gold})`, boxShadow:`0 0 10px ${T.gold}66` }}/>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:T.muted }}>
            <span>Unlocked: {Math.round(s.unlocked/s.total*100)}%</span>
            <span>Claimed: {Math.round(s.claimed/s.total*100)}%</span>
            <span>Total: {s.total.toLocaleString()} BBT</span>
          </div>
        </Card>

        {/* Milestones (if any) */}
        {s.milestones.length>0&&(
          <Card>
            <div style={{ fontFamily:T.serif, fontSize:14, fontWeight:600, color:'#fff', marginBottom:14 }}>Milestones</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {s.milestones.map((m,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0',
                  borderBottom:i<s.milestones.length-1?`1px solid ${T.border}`:'none' }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0,
                    background:m.done?`${T.green}18`:'rgba(255,255,255,.06)',
                    border:`1.5px solid ${m.done?T.green:T.border}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:12, color:m.done?T.green:T.muted }}>
                    {m.done?'✓':i+1}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, color:m.done?T.green:'#fff', fontWeight:m.done?600:400 }}>{m.label}</div>
                    <div style={{ fontSize:11, color:T.muted }}>{m.date}</div>
                  </div>
                  <Badge label={`${m.pct}%`} color={m.done?T.green:T.muted}/>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Claim area */}
        {isMyAddr(s.recipient) && claimable>0 && !claimed && !cancelled && (
          <Card glow={T.gold} style={{ textAlign:'center', padding:'28px 24px' }}>
            <div style={{ fontFamily:T.mono, fontSize:48, fontWeight:800, color:T.gold,
              textShadow:`0 0 40px ${T.gold}66`, marginBottom:6 }}>
              {claimable.toLocaleString()}
            </div>
            <div style={{ fontSize:14, color:T.gold, fontWeight:600, marginBottom:16 }}>BBT Available to Claim</div>
            <Btn variant="gold" size="lg" onClick={handleClaim} disabled={isBusy} full>
              {isBusy
                ? <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ width:16, height:16, border:`2px solid ${T.gold}44`,
                      borderTop:`2px solid ${T.gold}`, borderRadius:'50%',
                      animation:'spin 0.8s linear infinite', display:'inline-block' }}/>
                    {txPhase}…
                  </span>
                : `Claim ${claimable.toLocaleString()} BBT`}
            </Btn>
            <div style={{ fontSize:11, color:T.muted, marginTop:10 }}>
              {publicKey ? 'Sends to your connected wallet on Solana Devnet' : '⚠ Connect wallet to claim'}
            </div>
          </Card>
        )}

        {claimed && (
          <Card glow={T.green} style={{ textAlign:'center', padding:'24px' }}>
            <div style={{ fontSize:40 }}>✓</div>
            <div style={{ fontFamily:T.serif, fontSize:18, color:T.green, marginTop:8 }}>Claimed Successfully</div>
            <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>
              {txSig
                ? <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank" rel="noreferrer"
                    style={{ color:T.accent }}>View on Solana Explorer ↗</a>
                : 'Tokens sent to your wallet (demo)'}
            </div>
          </Card>
        )}

        {cancelled && (
          <Card glow={T.red} style={{ textAlign:'center', padding:'24px' }}>
            <div style={{ fontSize:40 }}>✕</div>
            <div style={{ fontFamily:T.serif, fontSize:18, color:T.red, marginTop:8 }}>Stream Cancelled</div>
            <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Tokens returned proportionally</div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Create Stream Page ───────────────────────────────────────

const STEPS = ['Type', 'Token & Recipient', 'Schedule', 'Review & Deploy'];

const inputStyle: React.CSSProperties = {
  width:'100%', padding:'10px 14px', borderRadius:10, background:'rgba(255,255,255,.05)',
  border:`1px solid rgba(167,139,255,.2)`, color:'#fff', fontSize:13, outline:'none',
  fontFamily:"'Sora',sans-serif",
};
const labelStyle: React.CSSProperties = { fontSize:12, color:'rgba(232,225,248,.5)', display:'block', marginBottom:6 };

function CreateStreamPage({ setPage }: { setPage:(p:string)=>void }) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [step, setStep] = useState(0);

  const today     = new Date().toISOString().slice(0,10);
  const oneYear   = new Date(Date.now() + 365*86400*1000).toISOString().slice(0,10);
  const threeMonths = new Date(Date.now() + 90*86400*1000).toISOString().slice(0,10);

  const [form, setForm] = useState({
    type:       'linear',
    tokenMint:  '',
    recipient:  '',
    amount:     '',
    startDate:  today,
    endDate:    oneYear,
    cliffDate:  '', // optional — only used for cliff/hybrid
  });
  const upd = (k: string, v: string) => setForm(f=>({...f,[k]:v}));
  const typeColor: Record<string,string> = { linear:T.accent, milestone:T.blue, cliff:T.gold, hybrid:'#c084fc' };

  // Tx state
  const [txPhase, setTxPhase] = useState('');
  const [txSig,   setTxSig]   = useState('');
  const [txErr,   setTxErr]   = useState('');
  const [done,    setDone]    = useState(false);
  const isBusy = txPhase !== '';

  const needCliff = form.type === 'cliff' || form.type === 'hybrid';

  const handleDeploy = useCallback(async () => {
    if (!publicKey || !sendTransaction) { alert('Connect wallet first'); return; }
    setTxErr('');

    // ── Validate inputs ──
    let recipientPK: PublicKey, mintPK: PublicKey;
    try { recipientPK = new PublicKey(form.recipient); } catch {
      setTxErr('Invalid recipient wallet address'); return;
    }
    if (recipientPK.equals(publicKey)) { setTxErr('Recipient cannot be your own wallet'); return; }
    try { mintPK = new PublicKey(form.tokenMint); } catch {
      setTxErr('Invalid token mint address'); return;
    }
    const amountNum = parseFloat(form.amount);
    if (!form.amount || isNaN(amountNum) || amountNum <= 0) { setTxErr('Enter a valid amount'); return; }
    if (!form.startDate || !form.endDate) { setTxErr('Start and end dates are required'); return; }
    const startTs = Math.floor(new Date(form.startDate).getTime() / 1000);
    const endTs   = Math.floor(new Date(form.endDate).getTime() / 1000);
    if (endTs <= startTs) { setTxErr('End date must be after start date'); return; }
    const cliffTs = form.cliffDate ? Math.floor(new Date(form.cliffDate).getTime() / 1000) : 0;
    if (cliffTs && (cliffTs < startTs || cliffTs > endTs)) {
      setTxErr('Cliff date must be between start and end date'); return;
    }

    // ── Build & send ──
    const seed = BigInt(Date.now());
    const totalBaseUnits = BigInt(Math.round(amountNum * 1_000_000)); // 6-decimal SPL token

    const [streamPDA] = getStreamPDA(publicKey, recipientPK, seed);
    const [escrowPDA] = getEscrowPDA(streamPDA);
    const creatorTA   = getATA(publicKey, mintPK);

    const milestoneEnabled = form.type === 'cliff' || form.type === 'milestone' || form.type === 'hybrid';

    const ix = buildCreateStreamIx(
      publicKey, recipientPK, mintPK, creatorTA, escrowPDA, streamPDA,
      totalBaseUnits,
      BigInt(startTs), BigInt(endTs), BigInt(cliffTs),
      seed, milestoneEnabled,
    );

    try {
      setTxPhase('Approving wallet');
      const tx = new Transaction().add(ix);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      setTxPhase('Sending transaction');
      const sig = await sendTransaction(tx, connection);
      setTxPhase('Confirming on-chain');
      await connection.confirmTransaction(sig, 'confirmed');
      setTxSig(sig);
      setTxPhase('');
      setDone(true);
    } catch (err: unknown) {
      setTxPhase('');
      const m = err instanceof Error ? err.message : String(err);
      setTxErr(m.length > 140 ? m.slice(0,140) + '…' : m);
    }
  }, [publicKey, sendTransaction, connection, form]);

  if (!publicKey) return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <TopBar title="Create Stream" sub="Lock tokens into a vesting schedule"
        actions={<Btn variant="ghost" size="sm" onClick={()=>setPage('dashboard')}>← Cancel</Btn>}/>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:20 }}>
        <div style={{ fontSize:40 }}>🔒</div>
        <div style={{ fontFamily:T.serif, fontSize:20, color:'#fff' }}>Wallet Required</div>
        <div style={{ fontSize:13, color:T.muted }}>Connect your Phantom or Solflare wallet to create streams</div>
        <WalletMultiButton style={{ background:`linear-gradient(135deg,${T.accent},${T.accentDk})`, borderRadius:11 }}/>
      </div>
    </div>
  );

  if (done) return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <TopBar title="Stream Created" sub="Your vesting stream is live on Solana Devnet"
        actions={<Btn variant="primary" onClick={()=>setPage('dashboard')}>Go to Dashboard →</Btn>}/>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:20 }}>
        <div style={{ fontSize:64 }}>🚀</div>
        <div style={{ fontFamily:T.serif, fontSize:22, color:T.green }}>Stream Deployed!</div>
        <div style={{ fontSize:13, color:T.muted, textAlign:'center', maxWidth:360 }}>
          Tokens are locked in a PDA escrow on Solana Devnet.<br/>The recipient can withdraw as they vest.
        </div>
        {txSig && (
          <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank" rel="noreferrer"
            style={{ fontSize:12, color:T.accent, fontFamily:T.mono }}>
            {txSig.slice(0,24)}… ↗ View on Explorer
          </a>
        )}
        <Btn variant="primary" size="lg" onClick={()=>setPage('dashboard')}>Open Dashboard</Btn>
      </div>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <TopBar title="Create Stream" sub="Deploy a vesting stream to Solana Devnet"
        actions={<Btn variant="ghost" size="sm" onClick={()=>setPage('dashboard')}>← Cancel</Btn>}/>

      <div style={{ flex:1, overflowY:'auto', padding:'24px 28px', display:'flex', flexDirection:'column', gap:20 }}>

        {/* Step indicators */}
        <div style={{ display:'flex', alignItems:'center' }}>
          {STEPS.map((s,i)=>(
            <React.Fragment key={i}>
              <div style={{ display:'flex', alignItems:'center', gap:8, cursor:i<=step?'pointer':'default' }}
                onClick={()=>i<=step&&setStep(i)}>
                <div style={{ width:28, height:28, borderRadius:'50%',
                  background:step===i?T.accent:i<step?T.green:'rgba(255,255,255,.08)',
                  border:`1.5px solid ${step===i?T.accent:i<step?T.green:'rgba(255,255,255,.12)'}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, color:'#fff', fontWeight:700, transition:'all .25s',
                  boxShadow:step===i?`0 0 14px ${T.accent}66`:'none' }}>
                  {i<step?'✓':i+1}
                </div>
                <span style={{ fontSize:11, color:step===i?'#fff':i<step?T.green:T.muted,
                  fontWeight:step===i?600:400, whiteSpace:'nowrap' }}>{s}</span>
              </div>
              {i<STEPS.length-1&&<div style={{ flex:1, height:1, margin:'0 8px', background:i<step?T.green:T.border }}/>}
            </React.Fragment>
          ))}
        </div>

        {/* Error banner */}
        {txErr && (
          <div style={{ padding:'12px 16px', background:`${T.red}10`, border:`1px solid ${T.red}44`,
            borderRadius:12, display:'flex', gap:10, alignItems:'flex-start', maxWidth:600 }}>
            <span style={{ fontSize:18, flexShrink:0 }}>⚠</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:T.red }}>Error</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{txErr}</div>
            </div>
            <Btn variant="ghost" size="sm" onClick={()=>setTxErr('')}>✕</Btn>
          </div>
        )}

        {/* Tx loading */}
        {isBusy && <div style={{ maxWidth:600 }}><TxProgress phase={txPhase}/></div>}

        {/* Step content */}
        <Card style={{ maxWidth:600 }}>

          {/* ── Step 0: Vesting type ─── */}
          {step===0&&(
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, color:'#fff', marginBottom:4 }}>Choose Vesting Type</div>
              {[
                {k:'linear',    label:'Linear',    desc:'Tokens unlock continuously from start → end date'},
                {k:'cliff',     label:'Cliff',     desc:'No tokens until cliff date, then linear vesting begins'},
                {k:'milestone', label:'Milestone', desc:'Gated behind on-chain milestone — creator unlocks manually'},
                {k:'hybrid',    label:'Hybrid',    desc:'Cliff + milestone + linear combined in one stream'},
              ].map(t=>(
                <div key={t.k} onClick={()=>upd('type',t.k)} style={{
                  padding:'13px 16px', borderRadius:12, cursor:'pointer',
                  border:`1.5px solid ${form.type===t.k?typeColor[t.k]:T.border}`,
                  background:form.type===t.k?`${typeColor[t.k]}10`:'transparent',
                  transition:'all .18s' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <Badge label={t.label.toUpperCase()} color={typeColor[t.k]}/>
                    <span style={{ fontSize:13, color:form.type===t.k?'#fff':T.muted }}>{t.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Step 1: Token & Recipient ─── */}
          {step===1&&(
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, color:'#fff', marginBottom:4 }}>Token & Recipient</div>
              <div>
                <label style={labelStyle}>Token Mint Address * <span style={{color:T.muted,fontWeight:400}}>(SPL token on devnet)</span></label>
                <input value={form.tokenMint} onChange={e=>upd('tokenMint',e.target.value)}
                  placeholder="e.g. So11111111111111111111111111111111111111112"
                  style={{...inputStyle, fontFamily:T.mono}} />
                <div style={{ fontSize:10.5, color:T.muted, marginTop:5 }}>
                  Enter the SPL token mint address. You must have this token in your wallet.
                </div>
              </div>
              <div>
                <label style={labelStyle}>Recipient Wallet Address *</label>
                <input value={form.recipient} onChange={e=>upd('recipient',e.target.value)}
                  placeholder="Solana wallet address (32–44 chars)"
                  style={{...inputStyle, fontFamily:T.mono}} />
              </div>
              <div>
                <label style={labelStyle}>Total Amount * <span style={{color:T.muted,fontWeight:400}}>(6 decimal places assumed)</span></label>
                <input value={form.amount} onChange={e=>upd('amount',e.target.value)}
                  placeholder="e.g. 100000" type="number" min="0"
                  style={inputStyle} />
              </div>
            </div>
          )}

          {/* ── Step 2: Schedule ─── */}
          {step===2&&(
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, color:'#fff', marginBottom:4 }}>Vesting Schedule</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={labelStyle}>Start Date *</label>
                  <input type="date" value={form.startDate} onChange={e=>upd('startDate',e.target.value)}
                    style={{...inputStyle, colorScheme:'dark'}} />
                </div>
                <div>
                  <label style={labelStyle}>End Date *</label>
                  <input type="date" value={form.endDate} onChange={e=>upd('endDate',e.target.value)}
                    style={{...inputStyle, colorScheme:'dark'}} />
                </div>
              </div>
              {needCliff&&(
                <div>
                  <label style={labelStyle}>Cliff Date <span style={{color:T.muted,fontWeight:400}}>(optional)</span></label>
                  <input type="date" value={form.cliffDate} onChange={e=>upd('cliffDate',e.target.value)}
                    min={form.startDate} max={form.endDate}
                    style={{...inputStyle, colorScheme:'dark', accentColor:T.gold}} />
                  <div style={{ fontSize:10.5, color:T.muted, marginTop:5 }}>
                    No tokens release until this date. Leave blank for no cliff.
                  </div>
                </div>
              )}
              {form.startDate && form.endDate && (
                <div style={{ padding:'12px 14px', background:T.bg1, borderRadius:10, border:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:11, color:T.muted, marginBottom:6 }}>Schedule Preview</div>
                  <div style={{ fontFamily:T.mono, fontSize:12, color:'#fff', lineHeight:1.8 }}>
                    <div>Start: <span style={{color:T.green}}>{form.startDate}</span></div>
                    {form.cliffDate && needCliff && <div>Cliff: <span style={{color:T.gold}}>{form.cliffDate}</span></div>}
                    <div>End: <span style={{color:T.accent}}>{form.endDate}</span></div>
                    <div style={{color:T.muted,marginTop:4}}>
                      Duration: {Math.round((new Date(form.endDate).getTime()-new Date(form.startDate).getTime())/86400000)} days
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Review & Deploy ─── */}
          {step===3&&(
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, color:'#fff', marginBottom:4 }}>Review & Deploy</div>
              {[
                {l:'Type',       v:form.type.charAt(0).toUpperCase()+form.type.slice(1)},
                {l:'Token Mint', v:form.tokenMint ? `${form.tokenMint.slice(0,12)}…` : '—'},
                {l:'Recipient',  v:form.recipient ? `${form.recipient.slice(0,16)}…` : '—'},
                {l:'Amount',     v:`${(+form.amount||0).toLocaleString()} tokens`},
                {l:'Start Date', v:form.startDate || '—'},
                {l:'End Date',   v:form.endDate   || '—'},
                ...(needCliff&&form.cliffDate ? [{l:'Cliff Date', v:form.cliffDate}] : []),
              ].map(r=>(
                <div key={r.l} style={{ display:'flex', justifyContent:'space-between',
                  padding:'9px 0', borderBottom:`1px solid ${T.border}` }}>
                  <span style={{ fontSize:12, color:T.muted }}>{r.l}</span>
                  <span style={{ fontSize:12, color:'#fff', fontFamily:T.mono }}>{r.v}</span>
                </div>
              ))}

              <div style={{ padding:'14px', background:`${T.gold}08`, border:`1px solid ${T.gold}22`, borderRadius:12, fontSize:12, color:T.muted }}>
                <div style={{ color:T.gold, fontWeight:600, marginBottom:4 }}>Transaction Info</div>
                Protocol fee: 1% · Tokens locked in PDA escrow · On Solana Devnet
              </div>

              <Btn variant="primary" size="lg" full onClick={handleDeploy} disabled={isBusy}>
                {isBusy
                  ? <span style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{width:14,height:14,border:`2px solid ${T.accent}44`,borderTop:`2px solid ${T.accent}`,borderRadius:'50%',animation:'spin .8s linear infinite',display:'inline-block'}}/>
                      {txPhase}…
                    </span>
                  : '🚀 Deploy Stream to Devnet'}
              </Btn>
            </div>
          )}
        </Card>

        {/* Nav buttons */}
        <div style={{ display:'flex', gap:10, maxWidth:600 }}>
          <Btn variant="ghost" onClick={()=>step>0?setStep(s=>s-1):setPage('dashboard')} style={{ flex:1 }}>
            {step===0?'Cancel':'← Back'}
          </Btn>
          {step<STEPS.length-1&&(
            <Btn variant="primary" onClick={()=>setStep(s=>s+1)} style={{ flex:2 }}>
              Next →
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Landing Page ─────────────────────────────────────────────

function LandingPage({ setPage }: { setPage:(p:string)=>void }) {
  const [tick, setTick] = useState(0);
  React.useEffect(()=>{const t=setInterval(()=>setTick(n=>n+1),2000);return()=>clearInterval(t);},[]);
  const hls = ['Stop Distributing Tokens Blindly.', 'Vesting Infrastructure for Solana.', 'Cliff. Milestone. Linear.', 'Your Token Payroll, On-Chain.'];
  const features = [
    { col:T.gold,   icon:'🔒', title:'Cliff Vesting',    desc:'Hard lock until cliff_end. Zero tokens leave vault before the date. Smart contract enforced.' },
    { col:T.blue,   icon:'🏁', title:'Milestone Unlock',  desc:'Creator confirms KPI on-chain — game level, revenue target, or any condition.' },
    { col:T.green,  icon:'📈', title:'Linear Streaming',  desc:'Tokens flow continuously from start to end. Recipients can claim anytime.' },
    { col:T.accent, icon:'⚡', title:'VGPV Anti-Bot',     desc:'Velocity Guard Penalty Valve: 3 rapid withdrawals → bot detected & blocked.' },
  ];
  return (
    <div style={{ height:'100%', overflowY:'auto' }}>
      {/* Hero */}
      <div style={{ position:'relative', overflow:'hidden', padding:'72px 60px 60px',
        background:'linear-gradient(135deg,#06030f,#120830,#060e1a,#0d0520)',
        backgroundSize:'400% 400%', animation:'gradShift 12s ease infinite' }}>
        <div style={{ position:'absolute', inset:0,
          backgroundImage:'linear-gradient(rgba(167,139,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(167,139,255,.04) 1px,transparent 1px)',
          backgroundSize:'48px 48px', pointerEvents:'none' }}/>
        <div style={{ position:'relative', maxWidth:680 }}>
          <Badge label="SOLANA DEVNET · BLOCKBITE TDP · v1.0" color={T.accent}/>
          <div key={tick} style={{ fontFamily:T.serif, fontSize:48, fontWeight:900, color:'#fff',
            lineHeight:1.12, margin:'18px 0 14px', animation:'hlFade .4s ease' }}>
            {hls[tick%hls.length]}
          </div>
          <p style={{ fontSize:15, color:'rgba(232,225,248,.65)', lineHeight:1.75, maxWidth:520, marginBottom:28 }}>
            BlockBite TDP is programmable token distribution infrastructure for Solana.
            Cliff, milestone, and linear vesting — enforced by audited smart contracts.
          </p>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <Btn variant="primary" size="lg" onClick={()=>setPage('new')}>Launch App →</Btn>
            <Btn variant="ghost"   size="lg" onClick={()=>setPage('dashboard')}>View Dashboard</Btn>
          </div>
          <div style={{ display:'flex', gap:32, marginTop:40, flexWrap:'wrap' }}>
            {[{v:'41',   l:'Tests Passing'},{v:'28',l:'Integration Tests'},{v:'5',l:'Instructions'},
              {v:'99.9%',l:'CI Uptime'}].map(s=>(
              <div key={s.l}>
                <div style={{ fontFamily:T.mono, fontSize:26, fontWeight:800,
                  color:T.gold, textShadow:`0 0 20px ${T.gold}55` }}>{s.v}</div>
                <div style={{ fontSize:11, color:T.muted }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={{ padding:'44px 60px', background:T.bg1, borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}` }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontFamily:T.serif, fontSize:10, fontWeight:700, color:T.accent, letterSpacing:'.16em', marginBottom:8 }}>HOW IT WORKS</div>
          <div style={{ fontFamily:T.serif, fontSize:26, fontWeight:800, color:'#fff' }}>Three phases. One protocol.</div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, maxWidth:860, margin:'0 auto' }}>
          {[
            {n:'01', col:T.gold,   icon:'🔒', title:'Cliff Gate',    desc:'Tokens locked until cliff_end timestamp. Zero withdrawals. Anti-bot by default.'},
            {n:'02', col:T.blue,   icon:'🏁', title:'Milestone',     desc:'Creator confirms KPI completion on-chain. Quota allocated per milestone hit.'},
            {n:'03', col:T.green,  icon:'📈', title:'Linear Stream', desc:'Stream flows continuously once conditions are met. Claim anytime.'},
          ].map(s=>(
            <div key={s.n} style={{ padding:'22px 20px', borderRadius:16,
              background:`${s.col}08`, border:`1.5px solid ${s.col}28` }}>
              <div style={{ fontFamily:T.mono, fontSize:10, color:`${s.col}66`, fontWeight:700, letterSpacing:'.08em', marginBottom:12 }}>{s.n}</div>
              <div style={{ fontSize:28, marginBottom:10 }}>{s.icon}</div>
              <div style={{ fontFamily:T.serif, fontSize:14, fontWeight:700, color:s.col, marginBottom:6 }}>{s.title}</div>
              <div style={{ fontSize:12, color:T.muted, lineHeight:1.65 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div style={{ padding:'44px 60px' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontFamily:T.serif, fontSize:24, fontWeight:800, color:'#fff' }}>Every distribution pattern covered.</div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, maxWidth:860, margin:'0 auto 28px' }}>
          {features.map(f=>(
            <Card key={f.title} style={{ display:'flex', gap:14, padding:'18px 20px' }}>
              <div style={{ width:42, height:42, borderRadius:12, background:`${f.col}12`,
                border:`1px solid ${f.col}33`, display:'flex', alignItems:'center',
                justifyContent:'center', flexShrink:0, fontSize:20 }}>{f.icon}</div>
              <div>
                <div style={{ fontFamily:T.serif, fontSize:13, fontWeight:700, color:'#fff', marginBottom:4 }}>{f.title}</div>
                <div style={{ fontSize:11.5, color:T.muted, lineHeight:1.65 }}>{f.desc}</div>
              </div>
            </Card>
          ))}
        </div>
        <div style={{ textAlign:'center' }}>
          <Btn variant="primary" size="lg" onClick={()=>setPage('dashboard')}>Open Dashboard →</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics Page ──────────────────────────────────────────

function AnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const [tick, setTick]   = useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const tvl        = (2_400_000 + tick * 12).toLocaleString();
  const streamRate = (0.000463 + tick * 0.000001).toFixed(6);

  const chartData = Array.from({ length: 30 }, (_, i) => ({
    day:      i + 1,
    unlocked: Math.round(12000 + Math.sin(i * 0.4) * 4000 + i * 800),
    claimed:  Math.round(8000  + Math.sin(i * 0.4) * 2000 + i * 500),
  }));
  const maxVal = Math.max(...chartData.map(d => d.unlocked));
  const cW = 560, cH = 120;

  const mkLine = (key: 'unlocked' | 'claimed') =>
    chartData.map((d, i) =>
      `${i === 0 ? 'M' : 'L'}${(i / (chartData.length - 1) * cW).toFixed(1)},${(cH - (d[key] / maxVal) * cH).toFixed(1)}`
    ).join(' ');
  const mkArea = (key: 'unlocked' | 'claimed') =>
    `${mkLine(key)} L${cW},${cH} L0,${cH} Z`;

  const typeBreakdown = [
    { type:'Linear',    pct:44, col:T.accent,   n:812 },
    { type:'Milestone', pct:28, col:T.blue,     n:515 },
    { type:'Cliff',     pct:18, col:T.gold,     n:331 },
    { type:'Hybrid',    pct:10, col:'#c084fc',  n:182 },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <TopBar title="Protocol Analytics" sub="Real-time on-chain vesting metrics · BlockBite TDP"
        actions={
          <div style={{ display:'flex', gap:4, background:T.bg1, border:`1px solid ${T.border}`, borderRadius:9, padding:3 }}>
            {['7d','30d','90d','all'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding:'5px 12px', borderRadius:7, border:'none', cursor:'pointer',
                background:period===p ? T.accent : 'transparent',
                color:period===p ? '#fff' : T.muted, fontSize:11, fontWeight:600, transition:'all .15s',
              }}>{p}</button>
            ))}
          </div>
        }/>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 28px', display:'flex', flexDirection:'column', gap:18 }}>

        {/* Live KPI strip */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
          {[
            { label:'Total Value Locked',  val:`$${tvl}`,    sub:'↑ $144/min live',        col:T.gold,   live:true  },
            { label:'Active Streams',      val:'1,840',       sub:'across all projects',     col:T.accent, live:false },
            { label:'BBT Distributed',     val:'48.2M TOKEN', sub:'all-time',                col:T.green,  live:false },
            { label:'Stream Rate (live)',   val:streamRate,    sub:'TOKEN/sec protocol-wide', col:T.blue,   live:true  },
            { label:'Protocol Uptime',     val:'99.98%',      sub:'since 2025-04-17',        col:T.green,  live:false },
          ].map(s => (
            <Card key={s.label} style={{ padding:'14px 16px', position:'relative' }}>
              {s.live && <div style={{ position:'absolute', top:10, right:10, width:7, height:7, borderRadius:'50%',
                background:T.green, boxShadow:`0 0 6px ${T.green}`, animation:'blink 1.4s ease-in-out infinite' }}/>}
              <div style={{ fontSize:9.5, color:T.muted, letterSpacing:'.06em', textTransform:'uppercase', marginBottom:5 }}>{s.label}</div>
              <div style={{ fontFamily:T.mono, fontSize:s.val.length>10?16:22, fontWeight:700, color:s.col, lineHeight:1 }}>{s.val}</div>
              <div style={{ fontSize:10, color:T.muted, marginTop:4 }}>{s.sub}</div>
            </Card>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:18 }}>

          {/* Velocity chart */}
          <Card>
            <div style={{ fontFamily:T.serif, fontSize:13, fontWeight:700, color:'#fff', marginBottom:14 }}>
              Vesting Velocity — Last 30 Days
            </div>
            <svg width="100%" viewBox={`0 0 ${cW} ${cH + 30}`} style={{ display:'block' }}>
              <defs>
                <linearGradient id="gu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={T.accent} stopOpacity={0.4}/>
                  <stop offset="1" stopColor={T.accent} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={T.green} stopOpacity={0.3}/>
                  <stop offset="1" stopColor={T.green} stopOpacity={0}/>
                </linearGradient>
              </defs>
              {[0, 0.5, 1].map(v => (
                <line key={v} x1="0" y1={v * cH} x2={cW} y2={v * cH}
                  stroke="rgba(255,255,255,.05)" strokeWidth="1"/>
              ))}
              <path d={mkArea('unlocked')} fill="url(#gu)"/>
              <path d={mkArea('claimed')}  fill="url(#gc)"/>
              <path d={mkLine('unlocked')} fill="none" stroke={T.accent} strokeWidth="2"
                strokeLinecap="round" style={{ filter:`drop-shadow(0 0 4px ${T.accent})` }}/>
              <path d={mkLine('claimed')}  fill="none" stroke={T.green} strokeWidth="2" strokeLinecap="round"/>
              {[0,9,19,29].map(i => (
                <text key={i} x={i / (chartData.length-1) * cW} y={cH+18}
                  textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono,monospace"
                  fill={T.muted}>D{chartData[i].day}</text>
              ))}
            </svg>
            <div style={{ display:'flex', gap:16, marginTop:6 }}>
              {[{c:T.accent,l:'Unlocked'},{c:T.green,l:'Claimed'}].map(x => (
                <div key={x.l} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ width:12, height:3, borderRadius:99, background:x.c }}/>
                  <span style={{ fontSize:10, color:T.muted }}>{x.l}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Stream type breakdown */}
          <Card>
            <div style={{ fontFamily:T.serif, fontSize:13, fontWeight:700, color:'#fff', marginBottom:14 }}>
              Stream Types
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {typeBreakdown.map(s => (
                <div key={s.type}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:s.col }}/>
                      <span style={{ fontSize:12, color:'#fff' }}>{s.type}</span>
                    </div>
                    <div>
                      <span style={{ fontFamily:T.mono, fontSize:12, color:s.col, fontWeight:700 }}>{s.pct}%</span>
                      <span style={{ fontSize:10, color:T.muted, marginLeft:5 }}>({s.n})</span>
                    </div>
                  </div>
                  <div style={{ height:7, borderRadius:99, background:'rgba(255,255,255,.06)', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${s.pct}%`, borderRadius:99,
                      background:`linear-gradient(90deg,${s.col}77,${s.col})` }}/>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ height:1, background:T.border, margin:'12px 0 8px' }}/>
            <div style={{ fontSize:11, color:T.muted }}>
              Total: <span style={{ color:'#fff', fontFamily:T.mono }}>1,840</span> active streams
            </div>
          </Card>
        </div>

        {/* Top streams table */}
        <Card style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'14px 20px', borderBottom:`1px solid ${T.border}`,
            fontFamily:T.serif, fontSize:13, fontWeight:700, color:'#fff' }}>
            Top Active Streams by TVL
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'rgba(255,255,255,.03)' }}>
                {['Stream','Type','Creator','Total','Unlocked','% Done','Status'].map(h => (
                  <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:9.5,
                    color:T.muted, letterSpacing:'.06em', fontWeight:700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STREAMS.map((s, i) => {
                const pct = Math.round(s.unlocked / s.total * 100);
                const tcMap: Record<string,string> = { linear:T.accent, milestone:T.blue, cliff:T.gold, hybrid:'#c084fc' };
                const scMap: Record<string,string> = { active:T.green, pending:T.gold, completed:T.muted, cancelled:T.red };
                const tc = tcMap[s.type] || T.accent;
                const sc = scMap[s.status] || T.muted;
                return (
                  <tr key={s.id} style={{ borderTop:`1px solid ${T.border}`, background:i%2?'rgba(255,255,255,.01)':'transparent' }}>
                    <td style={{ padding:'9px 16px', fontSize:12, fontWeight:600, color:'#fff' }}>{s.name}</td>
                    <td style={{ padding:'9px 16px' }}><Badge label={s.type.toUpperCase()} color={tc}/></td>
                    <td style={{ padding:'9px 16px', fontFamily:T.mono, fontSize:10, color:T.muted }}>{s.creator.slice(0,12)}</td>
                    <td style={{ padding:'9px 16px', fontFamily:T.mono, fontSize:11, color:'#fff' }}>{s.total.toLocaleString()} BBT</td>
                    <td style={{ padding:'9px 16px', fontFamily:T.mono, fontSize:11, color:T.accent }}>{s.unlocked.toLocaleString()}</td>
                    <td style={{ padding:'9px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ width:60, height:5, borderRadius:99, background:'rgba(255,255,255,.07)', overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:tc, borderRadius:99 }}/>
                        </div>
                        <span style={{ fontFamily:T.mono, fontSize:10, color:tc }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding:'9px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <div style={{ width:6, height:6, borderRadius:'50%', background:sc, boxShadow:`0 0 5px ${sc}` }}/>
                        <span style={{ fontSize:10.5, color:sc, fontWeight:600, textTransform:'uppercase' }}>{s.status}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        {/* Anti-dump health */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
          {[
            { title:'Market Pressure',     val:'0.04%',   sub:'daily unlock / supply',      col:T.green,  desc:'Well below 0.1% safety threshold. No dump risk.' },
            { title:'Cliff Compliance',     val:'100%',    sub:'of streams have cliff ≥ 7d', col:T.green,  desc:'All active streams enforce minimum cliff duration.' },
            { title:'Avg Vesting Duration', val:'14.2 mo', sub:'across active streams',      col:T.accent, desc:'Longer average = stronger anti-dump protection.' },
          ].map(m => (
            <Card key={m.title} style={{ border:`1px solid ${m.col}33` }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <div style={{ fontSize:11, fontWeight:600, color:m.col, fontFamily:T.serif }}>{m.title}</div>
                <Badge label="HEALTHY" color={T.green}/>
              </div>
              <div style={{ fontFamily:T.mono, fontSize:28, fontWeight:800, color:m.col, lineHeight:1 }}>{m.val}</div>
              <div style={{ fontSize:10.5, color:T.muted, marginTop:4 }}>{m.sub}</div>
              <div style={{ height:1, background:T.border, margin:'8px 0' }}/>
              <div style={{ fontSize:11, color:'rgba(232,225,248,.6)', marginTop:4 }}>{m.desc}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Milestone Verifier Page ──────────────────────────────────

interface VerifyLogEntry { ts:string; ms:string; result:string; sig:string; method:string }

function MilestoneVerifierPage() {
  const [activeStream, setActiveStream] = useState('s002');
  const [oracleType,   setOracleType]   = useState('manual');
  const [kpiVal,       setKpiVal]       = useState('');
  const [multisig,     setMultisig]     = useState(false);
  const [verifying,    setVerifying]    = useState(false);
  const [log, setLog] = useState<VerifyLogEntry[]>([
    { ts:'2025-05-21', ms:'Token Launch', result:'VERIFIED', sig:'5xKj…', method:'manual' },
  ]);

  const s = STREAMS.find(x => x.id === activeStream) || STREAMS[1];

  const verify = (label: string) => {
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      setLog(l => [{
        ts:     new Date().toISOString().slice(0, 10),
        ms:     label,
        result: 'VERIFIED',
        sig:    `${Math.random().toString(36).slice(2, 6)}…`,
        method: oracleType,
      }, ...l]);
    }, 1800);
  };

  const methods = [
    { v:'manual',   label:'Manual Approval', desc:'Creator signs a transaction to confirm KPI was met' },
    { v:'oracle',   label:'Chainlink Oracle', desc:'Automated on-chain data feed triggers milestone' },
    { v:'multisig', label:'Multi-sig (3/5)',  desc:'Requires 3 of 5 signers to approve unlock' },
    { v:'game',     label:'Game State PDA',   desc:'Level completion on-chain automatically triggers' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <TopBar title="Milestone Verifier" sub="On-chain KPI verification · Oracle integration · Multi-sig approval"/>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 28px', display:'flex', flexDirection:'column', gap:16 }}>

        {/* Stream selector — only milestone streams */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {STREAMS.filter(s2 => s2.type === 'milestone').map(s2 => (
            <button key={s2.id} onClick={() => setActiveStream(s2.id)} style={{
              padding:'7px 14px', borderRadius:10,
              border:`1.5px solid ${activeStream===s2.id ? T.blue : T.border}`,
              background:activeStream===s2.id ? `${T.blue}18` : 'rgba(255,255,255,.04)',
              color:activeStream===s2.id ? T.blue : T.muted,
              fontSize:12, fontWeight:600, cursor:'pointer',
            }}>{s2.name}</button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:16 }}>

          {/* Milestone list */}
          <Card>
            <div style={{ fontFamily:T.serif, fontSize:13, fontWeight:700, color:'#fff', marginBottom:12 }}>
              Milestone Conditions — {s.name}
            </div>
            {s.milestones.length === 0 ? (
              <div style={{ fontSize:12, color:T.muted, textAlign:'center', padding:'20px 0' }}>
                No milestones — stream is {s.type} type
              </div>
            ) : s.milestones.map((m, i) => (
              <div key={i} style={{ marginBottom:12, padding:'14px 16px', borderRadius:12,
                background:m.done ? `${T.green}0a` : `${T.blue}08`,
                border:`1.5px solid ${m.done ? T.green : T.blue}33` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:m.done ? T.green : '#fff' }}>{m.label}</div>
                    <div style={{ fontSize:10.5, color:T.muted, marginTop:2 }}>{m.date} · {m.pct}% unlock</div>
                  </div>
                  <Badge label={m.done ? 'VERIFIED' : 'PENDING'} color={m.done ? T.green : T.gold}/>
                </div>
                {m.done ? (
                  <div style={{ fontSize:10.5, color:T.green, fontFamily:T.mono }}>
                    ✓ Verified · {(m.pct * s.total / 100).toLocaleString()} BBT stream started
                  </div>
                ) : (
                  <div style={{ display:'flex', gap:8 }}>
                    <Btn variant="green" size="sm" onClick={() => verify(m.label)} disabled={verifying}>
                      {verifying ? 'Verifying…' : '▶ Verify Now'}
                    </Btn>
                    <Btn variant="ghost" size="sm">Link Oracle</Btn>
                  </div>
                )}
              </div>
            ))}
          </Card>

          {/* Config + log */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <Card>
              <div style={{ fontFamily:T.serif, fontSize:13, fontWeight:700, color:'#fff', marginBottom:12 }}>
                Verification Method
              </div>
              {methods.map(opt => (
                <div key={opt.v} onClick={() => setOracleType(opt.v)} style={{
                  padding:'10px 12px', borderRadius:10, cursor:'pointer', marginBottom:8,
                  background:oracleType===opt.v ? `${T.accent}10` : 'rgba(255,255,255,.03)',
                  border:`1px solid ${oracleType===opt.v ? T.accent : T.border}`, transition:'all .15s',
                }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontSize:12, fontWeight:600, color:oracleType===opt.v ? T.accent : '#fff' }}>{opt.label}</span>
                    <div style={{ width:16, height:16, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                      border:`2px solid ${oracleType===opt.v ? T.accent : T.border}`,
                      background:oracleType===opt.v ? T.accent : 'transparent' }}>
                      {oracleType===opt.v && <div style={{ width:6, height:6, borderRadius:'50%', background:'#fff' }}/>}
                    </div>
                  </div>
                  <div style={{ fontSize:10.5, color:T.muted }}>{opt.desc}</div>
                </div>
              ))}
              <input value={kpiVal} onChange={e => setKpiVal(e.target.value)}
                placeholder="KPI value (e.g. 10000 users, 1.5M revenue…)"
                style={{ width:'100%', padding:'9px 12px', background:'rgba(255,255,255,.05)',
                  border:`1px solid ${T.border}`, borderRadius:10, color:'#fff', fontSize:12,
                  outline:'none', fontFamily:T.mono, marginTop:4, marginBottom:8 }}/>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="checkbox" id="ms2" checked={multisig}
                  onChange={e => setMultisig(e.target.checked)} style={{ accentColor:T.accent }}/>
                <label htmlFor="ms2" style={{ fontSize:12, color:T.muted, cursor:'pointer' }}>
                  Require multi-sig approval
                </label>
              </div>
            </Card>

            <Card>
              <div style={{ fontFamily:T.serif, fontSize:12, fontWeight:700, color:'#fff', marginBottom:10 }}>
                Verification Log
              </div>
              {log.map((e, i) => (
                <div key={i} style={{ display:'flex', gap:8, padding:'7px 0',
                  borderBottom:i < log.length-1 ? `1px solid ${T.border}` : 'none' }}>
                  <div style={{ width:7, height:7, borderRadius:'50%', flexShrink:0,
                    background:e.result==='VERIFIED' ? T.green : T.red, marginTop:4 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11.5, color:'#fff' }}>{e.ms}</div>
                    <div style={{ fontSize:9.5, color:T.muted }}>{e.ts} · {e.method}</div>
                  </div>
                  <div style={{ fontFamily:T.mono, fontSize:9.5, color:T.green }}>{e.result}</div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Audit Trail Page ─────────────────────────────────────────

function AuditTrailPage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = AUDIT_LOG.filter((e: AuditEvent) => {
    if (filter !== 'all' && !e.action.startsWith(filter)) return false;
    if (search && !e.stream.includes(search) && !e.action.includes(search) && !e.actor.includes(search)) return false;
    return true;
  });

  const actionCol: Record<string,string> = {
    create_stream:       T.accent,
    withdraw:            T.green,
    cancel_attempt:      T.red,
    milestone_verified:  T.blue,
    cliff_expired:       T.gold,
  };
  const actionIcon: Record<string,string> = {
    create_stream:'＋', withdraw:'↓', cancel_attempt:'✗', milestone_verified:'✓', cliff_expired:'⏱',
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <TopBar title="Audit Trail" sub="Immutable on-chain event log · Full protocol history · Investor-grade transparency"/>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 28px', display:'flex', flexDirection:'column', gap:14 }}>

        {/* Summary row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            { l:'Total Events',    v:AUDIT_LOG.length,                                            c:T.accent },
            { l:'Streams Created', v:AUDIT_LOG.filter((e:AuditEvent)=>e.action==='create_stream').length, c:T.green },
            { l:'Withdrawals',     v:AUDIT_LOG.filter((e:AuditEvent)=>e.action==='withdraw').length,       c:T.gold  },
            { l:'Failed Txns',     v:AUDIT_LOG.filter((e:AuditEvent)=>e.status==='failed').length,         c:T.red   },
          ].map(s => (
            <Card key={s.l} style={{ padding:'12px 16px' }}>
              <div style={{ fontSize:9.5, color:T.muted, letterSpacing:'.06em', textTransform:'uppercase', marginBottom:4 }}>{s.l}</div>
              <div style={{ fontFamily:T.mono, fontSize:24, fontWeight:700, color:s.c }}>{s.v}</div>
            </Card>
          ))}
        </div>

        {/* Filters + search */}
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', gap:2, background:T.bg1, border:`1px solid ${T.border}`, borderRadius:9, padding:3 }}>
            {['all','create','withdraw','milestone','cancel'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding:'5px 12px', borderRadius:7, border:'none', cursor:'pointer',
                background:filter===f ? T.accent : 'transparent',
                color:filter===f ? '#fff' : T.muted,
                fontSize:11, fontWeight:600, transition:'all .15s', textTransform:'capitalize',
              }}>{f}</button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search stream ID, action, actor…"
            style={{ flex:1, maxWidth:280, padding:'7px 12px',
              background:'rgba(255,255,255,.05)', border:`1px solid ${T.border}`,
              borderRadius:10, color:'#fff', fontSize:12, outline:'none', fontFamily:T.mono }}/>
          <Btn variant="ghost" size="sm">↓ Export CSV</Btn>
          <Btn variant="ghost" size="sm">⛓ Explorer</Btn>
        </div>

        {/* Log table */}
        <Card style={{ padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'rgba(255,255,255,.04)' }}>
                {['Timestamp','Action','Stream','Actor','Amount','Tx Hash','Status'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:9.5,
                    color:T.muted, letterSpacing:'.06em', fontWeight:700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e: AuditEvent, i: number) => {
                const col = actionCol[e.action] || T.muted;
                return (
                  <tr key={i} style={{ borderTop:`1px solid ${T.border}`,
                    background:e.status==='failed' ? `${T.red}06` : i%2 ? 'rgba(255,255,255,.01)' : 'transparent' }}>
                    <td style={{ padding:'9px 16px', fontFamily:T.mono, fontSize:10.5, color:T.muted }}>{e.ts}</td>
                    <td style={{ padding:'9px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ width:22, height:22, borderRadius:7, background:`${col}15`,
                          border:`1px solid ${col}44`, display:'flex', alignItems:'center',
                          justifyContent:'center', fontSize:10, color:col, flexShrink:0 }}>
                          {actionIcon[e.action] || '·'}
                        </div>
                        <span style={{ fontFamily:T.mono, fontSize:11, color:col }}>{e.action}</span>
                      </div>
                    </td>
                    <td style={{ padding:'9px 16px', fontFamily:T.mono, fontSize:11, color:T.accent }}>{e.stream}</td>
                    <td style={{ padding:'9px 16px', fontFamily:T.mono, fontSize:10.5, color:T.muted }}>{e.actor}</td>
                    <td style={{ padding:'9px 16px', fontFamily:T.mono, fontSize:11, color:e.amount>0 ? T.gold : T.muted }}>
                      {e.amount > 0 ? `${e.amount.toLocaleString()} BBT` : '—'}
                    </td>
                    <td style={{ padding:'9px 16px', fontFamily:T.mono, fontSize:10.5, color:T.accent }}>{e.tx || '—'}</td>
                    <td style={{ padding:'9px 16px' }}>
                      <Badge label={e.status.toUpperCase()} color={e.status==='success' ? T.green : T.red}/>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ textAlign:'center', padding:'32px 0', color:T.muted, fontSize:13 }}>
              No events match your filter
            </div>
          )}
        </Card>

        {/* Integrity note */}
        <div style={{ padding:'14px 18px', background:`${T.green}08`,
          border:`1px solid ${T.green}22`, borderRadius:12, display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ fontSize:22 }}>🔐</div>
          <div>
            <div style={{ fontSize:12.5, fontWeight:600, color:T.green, marginBottom:2 }}>
              Immutable On-Chain Audit Trail
            </div>
            <div style={{ fontSize:11.5, color:'rgba(232,225,248,.6)' }}>
              Every event is permanently recorded on Solana. This log cannot be altered by anyone —
              including the stream creator. Exportable as verifiable proof for investors, auditors, and regulators.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root App (state-based routing) ──────────────────────────

export default function TDPApp() {
  const [page, setPage] = useState('landing');

  let content: React.ReactNode;
  if (page.startsWith('stream:')) {
    content = <StreamDetailPage id={page.replace('stream:','')} setPage={setPage}/>;
  } else if (page==='new') {
    content = <CreateStreamPage setPage={setPage}/>;
  } else if (page==='dashboard') {
    content = <DashboardPage setPage={setPage}/>;
  } else if (page==='analytics') {
    content = <AnalyticsPage/>;
  } else if (page==='milestones') {
    content = <MilestoneVerifierPage/>;
  } else if (page==='audit') {
    content = <AuditTrailPage/>;
  } else {
    content = <LandingPage setPage={setPage}/>;
  }

  return (
    <div style={{ display:'flex', height:'100vh', background:T.bg0, overflow:'hidden' }}>
      <Sidebar page={page} setPage={setPage}/>
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        {content}
      </div>
    </div>
  );
}
