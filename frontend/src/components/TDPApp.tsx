'use client';
import React, { useState, useCallback } from 'react';
import { T } from '@/lib/tokens';
import { STREAMS, MOCK_WALLET, Stream } from '@/lib/mock-data';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

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
    { key:'dashboard', icon:'◈', label:'Dashboard'    },
    { key:'new',       icon:'＋', label:'New Stream'   },
    { key:'landing',   icon:'⬡', label:'About'        },
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
          const active = page===n.key || (page.startsWith('stream')&&n.key==='dashboard');
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

function DashboardPage({ setPage }: { setPage:(p:string)=>void }) {
  const { publicKey } = useWallet();
  const [role, setRole] = useState('all');
  const wallet = publicKey ? `${publicKey.toBase58().slice(0,8)}…` : MOCK_WALLET;
  const filtered = STREAMS.filter(s =>
    role==='all' ? true : role==='creator' ? s.creator===MOCK_WALLET : s.recipient===MOCK_WALLET
  );
  const totalUnlocked = filtered.reduce((a,s)=>a+s.unlocked,0);
  const totalClaimed  = filtered.reduce((a,s)=>a+s.claimed,0);
  const claimable     = filtered.filter(s=>s.recipient===MOCK_WALLET).reduce((a,s)=>a+(s.unlocked-s.claimed),0);

  const typeColor: Record<string,string> = { linear:T.accent, milestone:T.blue, cliff:T.gold, hybrid:'#c084fc' };
  const statusColor: Record<string,string> = { active:T.green, pending:T.gold, completed:T.muted, cancelled:T.red };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <TopBar title="Stream Dashboard"
        sub={publicKey ? `Wallet: ${wallet}` : 'Connect wallet to interact with streams'}
        actions={
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {!publicKey && <Badge label="DEMO MODE" color={T.gold}/>}
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
            const isRec = s.recipient===MOCK_WALLET;
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

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                  {[
                    {l:'Unlocked', v:s.unlocked.toLocaleString(), c:T.accent},
                    {l:'Claimed',  v:s.claimed.toLocaleString(),  c:T.green},
                    {l:'Locked',   v:(s.total-s.unlocked).toLocaleString(), c:T.muted},
                  ].map(x=>(
                    <div key={x.l} style={{ textAlign:'center', padding:'7px 5px',
                      background:'rgba(255,255,255,.03)', borderRadius:9, border:`1px solid ${T.border}` }}>
                      <div style={{ fontFamily:T.mono, fontSize:13, fontWeight:700, color:x.c }}>{x.v}</div>
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

// ─── Stream Detail Page ───────────────────────────────────────

function StreamDetailPage({ id, setPage }: { id:string; setPage:(p:string)=>void }) {
  const { publicKey } = useWallet();
  const s = STREAMS.find(x=>x.id===id) || STREAMS[0];
  const claimable = s.unlocked - s.claimed;
  const typeColor: Record<string,string> = { linear:T.accent, milestone:T.blue, cliff:T.gold, hybrid:'#c084fc' };
  const [claiming, setClaiming] = useState(false);
  const [claimed,  setClaimed]  = useState(false);

  const handleClaim = useCallback(() => {
    if (!publicKey) { alert('Connect your wallet first!'); return; }
    setClaiming(true);
    setTimeout(()=>{ setClaiming(false); setClaimed(true); }, 2000);
  }, [publicKey]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <TopBar title={s.name} sub={`Stream ID: ${s.id} · ${s.type.toUpperCase()} vesting`}
        actions={
          <div style={{ display:'flex', gap:8 }}>
            <Btn variant="ghost" size="sm" onClick={()=>setPage('dashboard')}>← Back</Btn>
            {s.creator===MOCK_WALLET&&s.status==='active'&&
              <Btn variant="danger" size="sm">Cancel Stream</Btn>}
            {s.recipient===MOCK_WALLET&&claimable>0&&!claimed&&(
              <Btn variant="gold" onClick={handleClaim} disabled={claiming}>
                {claiming?'Processing…':`Claim ${claimable.toLocaleString()} BBT`}
              </Btn>
            )}
            {claimed&&<Badge label="✓ CLAIMED" color={T.green}/>}
          </div>
        }/>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 28px', display:'flex', flexDirection:'column', gap:16 }}>

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
        {s.recipient===MOCK_WALLET&&claimable>0&&!claimed&&(
          <Card glow={T.gold} style={{ textAlign:'center', padding:'28px 24px' }}>
            <div style={{ fontFamily:T.mono, fontSize:48, fontWeight:800, color:T.gold,
              textShadow:`0 0 40px ${T.gold}66`, marginBottom:6 }}>
              {claimable.toLocaleString()}
            </div>
            <div style={{ fontSize:14, color:T.gold, fontWeight:600, marginBottom:16 }}>BBT Available to Claim</div>
            <Btn variant="gold" size="lg" onClick={handleClaim} disabled={claiming} full>
              {claiming ? (
                <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ width:16, height:16, border:`2px solid ${T.gold}44`,
                    borderTop:`2px solid ${T.gold}`, borderRadius:'50%',
                    animation:'spin 0.8s linear infinite', display:'inline-block' }}/>
                  Processing Transaction…
                </span>
              ) : `Claim ${claimable.toLocaleString()} BBT`}
            </Btn>
            <div style={{ fontSize:11, color:T.muted, marginTop:10 }}>
              {publicKey ? 'Sends to your connected wallet on Solana Devnet' : '⚠ Connect wallet to claim'}
            </div>
          </Card>
        )}

        {claimed&&(
          <Card glow={T.green} style={{ textAlign:'center', padding:'24px' }}>
            <div style={{ fontSize:40 }}>✓</div>
            <div style={{ fontFamily:T.serif, fontSize:18, color:T.green, marginTop:8 }}>Claimed Successfully</div>
            <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Tokens sent to your wallet</div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Create Stream Page ───────────────────────────────────────

const STEPS = ['Stream Type', 'Recipients', 'Schedule', 'Fund Vault', 'Review'];

function CreateStreamPage({ setPage }: { setPage:(p:string)=>void }) {
  const { publicKey } = useWallet();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    type: 'linear', recipient: '', amount: '', cliff: '90', vest: '365', token: 'BBT',
  });
  const upd = (k: string, v: string) => setForm(f=>({...f,[k]:v}));
  const typeColor: Record<string,string> = { linear:T.accent, milestone:T.blue, cliff:T.gold, hybrid:'#c084fc' };

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

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <TopBar title="Create Stream" sub="Lock tokens into a vesting schedule on-chain"
        actions={<Btn variant="ghost" size="sm" onClick={()=>setPage('dashboard')}>← Cancel</Btn>}/>

      <div style={{ flex:1, overflowY:'auto', padding:'24px 28px', display:'flex', flexDirection:'column', gap:20 }}>

        {/* Step indicators */}
        <div style={{ display:'flex', alignItems:'center', gap:0 }}>
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
                <span style={{ fontSize:12, color:step===i?'#fff':i<step?T.green:T.muted,
                  fontWeight:step===i?600:400, whiteSpace:'nowrap' }}>{s}</span>
              </div>
              {i<STEPS.length-1&&<div style={{ flex:1, height:1, margin:'0 8px',
                background:i<step?T.green:T.border }}/>}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <Card style={{ maxWidth:600 }}>
          {step===0&&(
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, color:'#fff', marginBottom:4 }}>Choose Vesting Type</div>
              {[
                {k:'linear',    label:'Linear', desc:'Tokens stream continuously from start to end date'},
                {k:'cliff',     label:'Cliff',  desc:'Locked until cliff date, then linear vesting begins'},
                {k:'milestone', label:'Milestone', desc:'Creator sets milestone flag to unlock vesting'},
                {k:'hybrid',    label:'Hybrid', desc:'Combine cliff + milestone + linear in one stream'},
              ].map(t=>(
                <div key={t.k} onClick={()=>upd('type',t.k)} style={{
                  padding:'14px 16px', borderRadius:12, cursor:'pointer',
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

          {step===1&&(
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, color:'#fff', marginBottom:4 }}>Recipient & Amount</div>
              <div>
                <label style={{ fontSize:12, color:T.muted, display:'block', marginBottom:6 }}>Recipient Wallet Address *</label>
                <input value={form.recipient} onChange={e=>upd('recipient',e.target.value)}
                  placeholder="Solana wallet address (32-44 chars)"
                  style={{ width:'100%', padding:'10px 14px', borderRadius:10, background:T.bg1,
                    border:`1px solid ${T.border}`, color:'#fff', fontSize:13, outline:'none',
                    fontFamily:T.mono }} />
              </div>
              <div>
                <label style={{ fontSize:12, color:T.muted, display:'block', marginBottom:6 }}>Total Amount (BBT) *</label>
                <input value={form.amount} onChange={e=>upd('amount',e.target.value)}
                  placeholder="e.g. 100000" type="number"
                  style={{ width:'100%', padding:'10px 14px', borderRadius:10, background:T.bg1,
                    border:`1px solid ${T.border}`, color:'#fff', fontSize:13, outline:'none' }} />
              </div>
            </div>
          )}

          {step===2&&(
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, color:'#fff', marginBottom:4 }}>Vesting Schedule</div>
              <div>
                <label style={{ fontSize:12, color:T.muted, display:'block', marginBottom:6 }}>
                  Cliff Duration: <b style={{color:T.gold}}>{form.cliff} days</b>
                </label>
                <input type="range" min={0} max={365} value={form.cliff}
                  onChange={e=>upd('cliff',e.target.value)} style={{ width:'100%', accentColor:T.gold }} />
              </div>
              <div>
                <label style={{ fontSize:12, color:T.muted, display:'block', marginBottom:6 }}>
                  Vesting Duration: <b style={{color:T.accent}}>{form.vest} days</b>
                </label>
                <input type="range" min={30} max={1095} value={form.vest}
                  onChange={e=>upd('vest',e.target.value)} style={{ width:'100%', accentColor:T.accent }} />
              </div>
              <div style={{ padding:'12px 14px', background:T.bg1, borderRadius:10, border:`1px solid ${T.border}` }}>
                <div style={{ fontSize:12, color:T.muted }}>Schedule Preview</div>
                <div style={{ fontFamily:T.mono, fontSize:13, color:'#fff', marginTop:6 }}>
                  Cliff: {form.cliff}d → Linear vest: {form.vest}d → Total: {+form.cliff + +form.vest}d
                </div>
              </div>
            </div>
          )}

          {step===3&&(
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, color:'#fff', marginBottom:4 }}>Fund the Vault</div>
              <div style={{ padding:'16px', background:`${T.gold}10`, border:`1px solid ${T.gold}33`, borderRadius:12 }}>
                <div style={{ fontSize:12, color:T.gold, fontWeight:600, marginBottom:8 }}>TRANSACTION SUMMARY</div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#fff', marginBottom:6 }}>
                  <span>Stream amount</span><span style={{ fontFamily:T.mono }}>{(+form.amount||0).toLocaleString()} BBT</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:T.muted, marginBottom:6 }}>
                  <span>Protocol fee (1%)</span><span style={{ fontFamily:T.mono }}>{Math.floor((+form.amount||0)*0.01).toLocaleString()} BBT</span>
                </div>
                <div style={{ height:1, background:T.border, margin:'8px 0' }}/>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, color:T.gold, fontWeight:600 }}>
                  <span>Total deducted</span><span style={{ fontFamily:T.mono }}>{Math.floor((+form.amount||0)*1.01).toLocaleString()} BBT</span>
                </div>
              </div>
              <div style={{ fontSize:12, color:T.muted }}>
                Tokens will be locked in a PDA escrow on Solana devnet. The recipient can withdraw unlocked tokens at any time.
              </div>
            </div>
          )}

          {step===4&&(
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, color:'#fff', marginBottom:4 }}>Review & Deploy</div>
              {[
                {l:'Type',      v:form.type.charAt(0).toUpperCase()+form.type.slice(1)},
                {l:'Recipient', v:form.recipient||'(not set)'},
                {l:'Amount',    v:`${(+form.amount||0).toLocaleString()} BBT`},
                {l:'Cliff',     v:`${form.cliff} days`},
                {l:'Vesting',   v:`${form.vest} days`},
              ].map(r=>(
                <div key={r.l} style={{ display:'flex', justifyContent:'space-between',
                  padding:'9px 0', borderBottom:`1px solid ${T.border}` }}>
                  <span style={{ fontSize:12, color:T.muted }}>{r.l}</span>
                  <span style={{ fontSize:13, color:'#fff', fontFamily:T.mono }}>{r.v}</span>
                </div>
              ))}
              <Btn variant="primary" size="lg" full onClick={()=>{ alert('✅ Stream created on devnet! (demo)'); setPage('dashboard'); }}>
                🚀 Deploy Stream to Devnet
              </Btn>
            </div>
          )}
        </Card>

        {/* Nav buttons */}
        <div style={{ display:'flex', gap:10, maxWidth:600 }}>
          <Btn variant="ghost" onClick={()=>step>0?setStep(s=>s-1):setPage('dashboard')} style={{ flex:1 }}>
            {step===0?'Cancel':'← Back'}
          </Btn>
          <Btn variant="primary" onClick={()=>step<STEPS.length-1&&setStep(s=>s+1)} style={{ flex:2 }}
            disabled={step===STEPS.length-1}>
            {step===STEPS.length-1?'Deploy →':'Next →'}
          </Btn>
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
