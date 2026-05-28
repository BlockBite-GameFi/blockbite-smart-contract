'use client';
import React, { useState, useCallback, useEffect } from 'react';
import { T } from '@/lib/tokens';
import { AUDIT_LOG, AuditEvent, STREAMS } from '@/lib/mock-data';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import {
  useProgram, ParsedStream, parseAnchorError,
  calculateUnlocked,
} from '@/lib/program';

// ─── Time helper ─────────────────────────────────────────────

function fmtTimeRem(endSec: number, nowSec: number): string {
  const diff = Math.max(0, Math.floor(endSec - nowSec));
  if (diff === 0) return 'Ended';
  const days = Math.floor(diff / 86400);
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(diff / 3600);
  if (hours >= 1) return `${hours}h left`;
  return `${Math.floor(diff / 60)}m left`;
}

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

// ─── Tx Loading Banner ────────────────────────────────────────

type TxState = 'idle'|'approving'|'sending'|'confirming'|'success'|'error';

function TxLoadingBanner({ state, error, sig }: { state:TxState; error:string; sig:string }) {
  if (state==='idle') return null;
  const msgs: Record<TxState,string> = {
    idle:'', approving:'Approve in wallet…', sending:'Sending transaction…',
    confirming:'Confirming on-chain…', success:'Transaction confirmed!', error,
  };
  const col = state==='success' ? T.green : state==='error' ? T.red : T.accent;
  return (
    <div style={{ padding:'12px 18px', borderRadius:12, background:`${col}12`,
      border:`1px solid ${col}33`, display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
      {(state==='approving'||state==='sending'||state==='confirming') && (
        <div style={{ width:16,height:16,border:`2px solid ${col}44`,borderTop:`2px solid ${col}`,
          borderRadius:'50%',animation:'spin 0.8s linear infinite',flexShrink:0 }}/>
      )}
      {state==='success' && <span style={{ fontSize:18 }}>✓</span>}
      {state==='error'   && <span style={{ fontSize:18 }}>✗</span>}
      <span style={{ fontSize:12.5, color:col, flex:1 }}>{msgs[state]}</span>
      {state==='success'&&sig&&(
        <a href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`} target="_blank" rel="noreferrer"
          style={{ fontSize:11, color:T.accent, textDecoration:'underline' }}>View tx ↗</a>
      )}
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────

function DashboardPage({ setPage }: { setPage:(p:string)=>void }) {
  const { publicKey } = useWallet();
  const { fetchStreams, withdraw: doWithdraw, cancelStream: doCancel, setMilestone: doMilestone } = useProgram();
  const [streams,  setStreams]  = useState<ParsedStream[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [fetchErr, setFetchErr] = useState('');
  const [role,     setRole]     = useState('all');
  const [txState,  setTxState]  = useState<TxState>('idle');
  const [txError,  setTxError]  = useState('');
  const [txSig,    setTxSig]    = useState('');
  const [actingOn, setActingOn] = useState('');
  const [confirmCancel, setConfirmCancel] = useState<ParsedStream|null>(null);

  const load = useCallback(async () => {
    if (!publicKey) { setStreams([]); return; }
    setLoading(true); setFetchErr('');
    try { setStreams(await fetchStreams(publicKey)); }
    catch (e) { setFetchErr(parseAnchorError(e)); }
    finally { setLoading(false); }
  }, [publicKey, fetchStreams]);

  useEffect(() => { load(); }, [load]);

  const now      = Date.now()/1000;
  const filtered = publicKey ? streams.filter(s => {
    if (role==='creator')   return s.account.creator.equals(publicKey);
    if (role==='recipient') return s.account.recipient.equals(publicKey);
    return true;
  }) : [];

  const totalU    = filtered.reduce((a,s)=>a+calculateUnlocked(s.account,now),0);
  const totalC    = filtered.reduce((a,s)=>a+Number(s.account.amountWithdrawn),0);
  const claimable = filtered.filter(s=>publicKey&&s.account.recipient.equals(publicKey))
                            .reduce((a,s)=>a+s.claimable,0);

  async function handleWithdraw(s: ParsedStream) {
    setActingOn(s.pubkey.toBase58()); setTxState('approving'); setTxError(''); setTxSig('');
    try {
      setTxState('sending'); const sig = await doWithdraw(s);
      setTxState('confirming'); await new Promise(r=>setTimeout(r,1500));
      setTxSig(sig); setTxState('success'); await load();
    } catch (err) { setTxError(parseAnchorError(err)); setTxState('error'); }
    finally { setTimeout(()=>{ setTxState('idle'); setActingOn(''); }, 4500); }
  }

  async function handleCancel(s: ParsedStream) {
    setConfirmCancel(null);
    setActingOn(s.pubkey.toBase58()); setTxState('approving'); setTxError(''); setTxSig('');
    try {
      setTxState('sending'); const sig = await doCancel(s);
      setTxState('confirming'); await new Promise(r=>setTimeout(r,1500));
      setTxSig(sig); setTxState('success'); await load();
    } catch (err) { setTxError(parseAnchorError(err)); setTxState('error'); }
    finally { setTimeout(()=>{ setTxState('idle'); setActingOn(''); }, 4500); }
  }

  async function handleMilestone(s: ParsedStream) {
    setActingOn(s.pubkey.toBase58()); setTxState('approving'); setTxError(''); setTxSig('');
    try {
      setTxState('sending'); const sig = await doMilestone(s);
      setTxState('confirming'); await new Promise(r=>setTimeout(r,1500));
      setTxSig(sig); setTxState('success'); await load();
    } catch (err) { setTxError(parseAnchorError(err)); setTxState('error'); }
    finally { setTimeout(()=>{ setTxState('idle'); setActingOn(''); }, 4500); }
  }

  const walletStr = publicKey ? `${publicKey.toBase58().slice(0,8)}…${publicKey.toBase58().slice(-6)}` : '';

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Cancel confirmation modal */}
      {confirmCancel && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', display:'flex',
          alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:T.bg1, border:`1px solid ${T.red}44`, borderRadius:18,
            padding:'28px 32px', maxWidth:420, width:'100%', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:10 }}>⚠️</div>
            <div style={{ fontFamily:T.serif, fontSize:17, color:'#fff', marginBottom:8 }}>Cancel Stream?</div>
            <div style={{ fontSize:13, color:T.muted, marginBottom:24, lineHeight:1.6 }}>
              Unlocked tokens will go to the recipient.<br/>
              Locked tokens will return to you.
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <Btn variant="ghost" full onClick={()=>setConfirmCancel(null)}>Keep Stream</Btn>
              <Btn variant="danger" full onClick={()=>handleCancel(confirmCancel)}>Yes, Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      <TopBar title="Stream Dashboard"
        sub={publicKey ? `Wallet: ${walletStr}` : 'Connect wallet to view your streams'}
        actions={
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {!publicKey && <Badge label="WALLET REQUIRED" color={T.gold}/>}
            <Btn variant="ghost" size="sm" onClick={load} disabled={loading}>↻ Refresh</Btn>
            <Btn variant="primary" onClick={()=>setPage('new')}>+ New Stream</Btn>
          </div>
        }/>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 28px', display:'flex', flexDirection:'column', gap:18 }}>
        <TxLoadingBanner state={txState} error={txError} sig={txSig}/>

        {!publicKey ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            flex:1, gap:20, padding:'60px 0' }}>
            <div style={{ fontSize:40 }}>🔌</div>
            <div style={{ fontFamily:T.serif, fontSize:20, color:'#fff' }}>Connect Wallet</div>
            <div style={{ fontSize:13, color:T.muted }}>Connect Phantom or Solflare to see your devnet streams</div>
            <WalletMultiButton style={{ background:`linear-gradient(135deg,${T.accent},${T.accentDk})`, borderRadius:11 }}/>
          </div>
        ) : loading ? (
          <div style={{ textAlign:'center', padding:'60px 0', color:T.muted }}>
            <div style={{ width:32,height:32,border:`3px solid ${T.border}`,borderTop:`3px solid ${T.accent}`,
              borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/>
            Fetching streams from devnet…
          </div>
        ) : fetchErr ? (
          <div style={{ padding:'16px', background:`${T.red}12`, border:`1px solid ${T.red}33`,
            borderRadius:12, color:T.red, fontSize:13 }}>{fetchErr}</div>
        ) : (
          <>
            {/* Stats row */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
              {[
                { label:'Total Streams', value:filtered.length, sub:'streams found', color:'#fff', icon:'◈' },
                { label:'Unlocked',  value:totalU>0?`${(totalU/1e6).toFixed(2)}M`:'0', sub:'tokens unlocked',  color:T.accent, icon:'🔓' },
                { label:'Claimed',   value:totalC>0?`${(totalC/1e6).toFixed(2)}M`:'0', sub:'tokens claimed',   color:T.green,  icon:'✓'  },
                { label:'Claimable', value:claimable.toLocaleString(), sub:'ready now', color:T.gold, icon:'⚡' },
              ].map(s=>(
                <Card key={s.label} style={{ padding:'14px 16px' }}><StatBox {...s}/></Card>
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
            {filtered.length===0 ? (
              <div style={{ textAlign:'center', padding:'40px 0', color:T.muted }}>
                <div style={{ fontSize:36, marginBottom:12 }}>📭</div>
                <div style={{ fontSize:14 }}>No streams for this wallet yet</div>
                <Btn variant="primary" style={{ marginTop:16 }} onClick={()=>setPage('new')}>Create First Stream</Btn>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {filtered.map(s=>{
                  const acc     = s.account;
                  const total   = Number(acc.totalAmount);
                  const claimed = Number(acc.amountWithdrawn);
                  const unl     = calculateUnlocked(acc, now);
                  const pctU    = total>0 ? Math.round(unl/total*100) : 0;
                  const pctC    = total>0 ? Math.round(claimed/total*100) : 0;
                  const isRec   = publicKey && acc.recipient.equals(publicKey);
                  const isCre   = publicKey && acc.creator.equals(publicKey);
                  const acting  = actingOn===s.pubkey.toBase58() && txState!=='idle';
                  const timeRem = fmtTimeRem(Number(acc.endTime), now);
                  const needsMilestone = isCre && acc.milestoneEnabled && !acc.milestoneReached && !acc.isCancelled;

                  return (
                    <Card key={s.pubkey.toBase58()} onClick={()=>setPage(`stream:${s.pubkey.toBase58()}`)}
                      style={{ padding:'16px 20px' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontFamily:T.mono, fontSize:12, fontWeight:600, color:'#fff' }}>
                              {s.pubkey.toBase58().slice(0,12)}…
                            </span>
                            {Number(acc.cliffTime)>0&&<Badge label="CLIFF" color={T.gold}/>}
                            {acc.milestoneReached&&<Badge label="MILESTONE ✓" color={T.blue}/>}
                            {isRec&&<Badge label="RECEIVING" color={T.blue}/>}
                          </div>
                          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                            <AddrPill addr={isRec?`From ${acc.creator.toBase58().slice(0,8)}…`:`To ${acc.recipient.toBase58().slice(0,8)}…`}/>
                            <Tag label={s.status} dot={s.status}/>
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:6 }} onClick={e=>e.stopPropagation()}>
                          {needsMilestone && (
                            <Btn variant="ghost" size="sm" disabled={acting}
                              onClick={()=>handleMilestone(s)}>
                              {acting?'Processing…':'✓ Set Milestone'}
                            </Btn>
                          )}
                          {isRec && s.claimable>0 && (
                            <Btn variant="gold" size="sm" disabled={acting}
                              onClick={()=>handleWithdraw(s)}>
                              {acting?'Processing…':`Withdraw ${s.claimable.toLocaleString()}`}
                            </Btn>
                          )}
                          {isCre && s.status==='active' && (
                            <Btn variant="danger" size="sm" disabled={acting}
                              onClick={()=>setConfirmCancel(s)}>
                              Cancel
                            </Btn>
                          )}
                        </div>
                      </div>

                      {/* Dual progress bar */}
                      <div style={{ position:'relative', height:8, borderRadius:99, background:'rgba(255,255,255,.06)', overflow:'hidden', marginBottom:8 }}>
                        <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${pctU}%`, borderRadius:99, background:`${T.accent}44` }}/>
                        <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${pctC}%`, borderRadius:99,
                          background:`linear-gradient(90deg,${T.accent}99,${T.accent})`, boxShadow:`0 0 8px ${T.accent}55` }}/>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:T.muted, marginBottom:12 }}>
                        <span>Unlocked {pctU}%</span>
                        <span>Claimed {pctC}%</span>
                        <span style={{ fontFamily:T.mono, color:'#fff' }}>{(total/1e6).toFixed(2)}M tokens</span>
                      </div>

                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8 }}>
                        {[
                          {l:'Unlocked',  v:unl.toLocaleString(),           c:T.accent},
                          {l:'Claimed',   v:claimed.toLocaleString(),        c:T.green},
                          {l:'Locked',    v:(total-unl).toLocaleString(),    c:T.muted},
                          {l:'Remaining', v:timeRem,                         c:s.status==='active'?T.blue:T.muted},
                        ].map(x=>(
                          <div key={x.l} style={{ textAlign:'center', padding:'7px 5px',
                            background:'rgba(255,255,255,.03)', borderRadius:9, border:`1px solid ${T.border}` }}>
                            <div style={{ fontFamily:T.mono, fontSize:11, fontWeight:700, color:x.c }}>{x.v}</div>
                            <div style={{ fontSize:9, color:T.muted, marginTop:2 }}>{x.l}</div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Stream Detail Page ───────────────────────────────────────

function StreamDetailPage({ id, setPage }: { id:string; setPage:(p:string)=>void }) {
  const { publicKey } = useWallet();
  const { fetchStreams, withdraw: doWithdraw, cancelStream: doCancel, setMilestone: doMilestone } = useProgram();
  const [stream,   setStream]   = useState<ParsedStream|null>(null);
  const [loading,  setLoading]  = useState(true);
  const [txState,  setTxState]  = useState<TxState>('idle');
  const [txError,  setTxError]  = useState('');
  const [txSig,    setTxSig]    = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const reload = useCallback(async () => {
    if (!publicKey) { setLoading(false); return; }
    try {
      const all = await fetchStreams(publicKey);
      setStream(all.find(s=>s.pubkey.toBase58()===id)||null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [publicKey, id, fetchStreams]);

  useEffect(() => { reload(); }, [reload]);

  async function handleWithdraw() {
    if (!stream) return;
    setTxState('approving'); setTxError(''); setTxSig('');
    try {
      setTxState('sending');
      const sig = await doWithdraw(stream);
      setTxState('confirming'); await new Promise(r=>setTimeout(r,1500));
      setTxSig(sig); setTxState('success');
      await reload();
    } catch (e) { setTxError(parseAnchorError(e)); setTxState('error'); }
  }

  async function handleCancel() {
    if (!stream) return;
    setShowConfirm(false);
    setTxState('approving'); setTxError(''); setTxSig('');
    try {
      setTxState('sending');
      const sig = await doCancel(stream);
      setTxState('confirming'); await new Promise(r=>setTimeout(r,1500));
      setTxSig(sig); setTxState('success');
      await reload();
    } catch (e) { setTxError(parseAnchorError(e)); setTxState('error'); }
  }

  async function handleMilestone() {
    if (!stream) return;
    setTxState('approving'); setTxError(''); setTxSig('');
    try {
      setTxState('sending');
      const sig = await doMilestone(stream);
      setTxState('confirming'); await new Promise(r=>setTimeout(r,1500));
      setTxSig(sig); setTxState('success');
      await reload();
    } catch (e) { setTxError(parseAnchorError(e)); setTxState('error'); }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
      <div style={{ width:32,height:32,border:`3px solid ${T.border}`,borderTop:`3px solid ${T.accent}`,
        borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
    </div>
  );

  if (!stream) return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <TopBar title="Stream Not Found"
        actions={<Btn variant="ghost" size="sm" onClick={()=>setPage('dashboard')}>← Back</Btn>}/>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
        flexDirection:'column', gap:12 }}>
        <div style={{ fontSize:40 }}>🔍</div>
        <div style={{ color:T.muted }}>Stream not found or wallet not connected</div>
      </div>
    </div>
  );

  const acc            = stream.account;
  const now            = Date.now()/1000;
  const total          = Number(acc.totalAmount);
  const claimed        = Number(acc.amountWithdrawn);
  const unlocked       = calculateUnlocked(acc, now);
  const isRec          = publicKey && acc.recipient.equals(publicKey);
  const isCre          = publicKey && acc.creator.equals(publicKey);
  const busy           = txState !== 'idle';
  const needsMilestone = isCre && acc.milestoneEnabled && !acc.milestoneReached && !acc.isCancelled;
  const timeRem        = fmtTimeRem(Number(acc.endTime), now);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Cancel confirmation modal */}
      {showConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', display:'flex',
          alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:T.bg1, border:`1px solid ${T.red}44`, borderRadius:18,
            padding:'28px 32px', maxWidth:400, width:'100%', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:10 }}>⚠️</div>
            <div style={{ fontFamily:T.serif, fontSize:17, color:'#fff', marginBottom:8 }}>Cancel Stream?</div>
            <div style={{ fontSize:13, color:T.muted, marginBottom:24, lineHeight:1.6 }}>
              Unlocked tokens go to the recipient.<br/>Locked tokens return to you.
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <Btn variant="ghost" full onClick={()=>setShowConfirm(false)}>Keep Stream</Btn>
              <Btn variant="danger" full onClick={handleCancel}>Yes, Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      <TopBar title={`Stream ${stream.pubkey.toBase58().slice(0,12)}…`}
        sub={`${Number(acc.cliffTime)>0?'Cliff':'Linear'} vesting · Solana Devnet`}
        actions={
          <div style={{ display:'flex', gap:8 }}>
            <Btn variant="ghost" size="sm" onClick={()=>setPage('dashboard')}>← Back</Btn>
            {needsMilestone && (
              <Btn variant="ghost" size="sm" onClick={handleMilestone} disabled={busy}
                style={{ border:`1px solid ${T.blue}44`, color:T.blue }}>
                {busy?'Processing…':'✓ Set Milestone'}
              </Btn>
            )}
            {isCre && stream.status==='active' && (
              <Btn variant="danger" size="sm" onClick={()=>setShowConfirm(true)} disabled={busy}>
                {busy?'Processing…':'Cancel Stream'}
              </Btn>
            )}
            {isRec && stream.claimable>0 && (
              <Btn variant="gold" onClick={handleWithdraw} disabled={busy}>
                {busy?'Processing…':`Withdraw ${stream.claimable.toLocaleString()}`}
              </Btn>
            )}
          </div>
        }/>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 28px', display:'flex', flexDirection:'column', gap:16 }}>
        <TxLoadingBanner state={txState} error={txError} sig={txSig}/>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
          {[
            {label:'Total',     value:(total/1e6).toFixed(2)+'M',      sub:'tokens allocated', color:'#fff'  },
            {label:'Unlocked',  value:unlocked.toLocaleString(),         sub:'tokens unlocked',  color:T.accent},
            {label:'Claimed',   value:claimed.toLocaleString(),          sub:'tokens claimed',   color:T.green },
            {label:'Claimable', value:stream.claimable.toLocaleString(), sub:'ready now',        color:T.gold  },
            {label:'Remaining', value:timeRem,                           sub:'until stream ends', color:T.blue  },
          ].map(x=>(<Card key={x.label} style={{padding:'14px 16px'}}><StatBox {...x}/></Card>))}
        </div>

        {/* Meta */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', padding:'12px 16px',
          background:T.bg1, borderRadius:12, border:`1px solid ${T.border}` }}>
          {Number(acc.cliffTime)>0&&<Badge label="CLIFF" color={T.gold}/>}
          {acc.milestoneReached&&<Badge label="MILESTONE ✓" color={T.blue}/>}
          {acc.isCancelled&&<Badge label="CANCELLED" color={T.red}/>}
          <Tag label={stream.status} dot={stream.status}/>
          {Number(acc.cliffTime)>0&&(
            <span style={{fontSize:12,color:T.muted}}>
              Cliff: <b style={{color:'#fff'}}>{new Date(Number(acc.cliffTime)*1000).toLocaleDateString()}</b>
            </span>
          )}
          <span style={{fontSize:12,color:T.muted}}>
            End: <b style={{color:'#fff'}}>{new Date(Number(acc.endTime)*1000).toLocaleDateString()}</b>
          </span>
          <span style={{fontSize:12,color:T.muted}}>Mint: <AddrPill addr={acc.mint.toBase58().slice(0,10)+'…'}/></span>
        </div>

        {/* Progress */}
        <Card>
          <div style={{fontFamily:T.serif,fontSize:14,fontWeight:600,color:'#fff',marginBottom:16}}>Vesting Progress</div>
          <div style={{position:'relative',height:12,borderRadius:99,background:'rgba(255,255,255,.07)',overflow:'hidden',marginBottom:10}}>
            <div style={{position:'absolute',left:0,top:0,height:'100%',
              width:`${total>0?Math.round(unlocked/total*100):0}%`,background:`${T.accent}3a`}}/>
            <div style={{position:'absolute',left:0,top:0,height:'100%',
              width:`${total>0?Math.round(claimed/total*100):0}%`,
              background:`linear-gradient(90deg,${T.gold}88,${T.gold})`,boxShadow:`0 0 10px ${T.gold}66`}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:T.muted}}>
            <span>Unlocked: {total>0?Math.round(unlocked/total*100):0}%</span>
            <span>Claimed: {total>0?Math.round(claimed/total*100):0}%</span>
            <span>Total: {(total/1e6).toFixed(2)}M tokens</span>
          </div>
        </Card>

        {/* Claim CTA */}
        {isRec && stream.claimable>0 && txState==='idle' && (
          <Card glow={T.gold} style={{textAlign:'center',padding:'28px 24px'}}>
            <div style={{fontFamily:T.mono,fontSize:40,fontWeight:800,color:T.gold,
              textShadow:`0 0 40px ${T.gold}66`,marginBottom:6}}>
              {stream.claimable.toLocaleString()}
            </div>
            <div style={{fontSize:14,color:T.gold,fontWeight:600,marginBottom:16}}>Tokens Available to Withdraw</div>
            <Btn variant="gold" size="lg" onClick={handleWithdraw} full>Withdraw to Wallet</Btn>
            <div style={{fontSize:11,color:T.muted,marginTop:10}}>Real transaction on Solana Devnet</div>
          </Card>
        )}

        {/* Success card */}
        {txState==='success' && (
          <Card glow={T.green} style={{textAlign:'center',padding:'24px'}}>
            <div style={{fontSize:40}}>✓</div>
            <div style={{fontFamily:T.serif,fontSize:18,color:T.green,marginTop:8}}>Transaction Confirmed</div>
            {txSig&&(
              <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
                target="_blank" rel="noreferrer"
                style={{fontSize:12,color:T.accent,display:'block',marginTop:6,textDecoration:'underline'}}>
                View on Explorer ↗
              </a>
            )}
          </Card>
        )}

        {/* Addresses */}
        <Card style={{padding:'14px 18px'}}>
          <div style={{fontFamily:T.serif,fontSize:13,fontWeight:700,color:'#fff',marginBottom:12}}>Addresses</div>
          {[
            {l:'Stream PDA', v:stream.pubkey.toBase58()},
            {l:'Creator',    v:acc.creator.toBase58()},
            {l:'Recipient',  v:acc.recipient.toBase58()},
            {l:'Mint',       v:acc.mint.toBase58()},
          ].map(row=>(
            <div key={row.l} style={{display:'flex',justifyContent:'space-between',
              padding:'7px 0',borderBottom:`1px solid ${T.border}`}}>
              <span style={{fontSize:11,color:T.muted}}>{row.l}</span>
              <a href={`https://explorer.solana.com/address/${row.v}?cluster=devnet`}
                target="_blank" rel="noreferrer"
                style={{fontFamily:T.mono,fontSize:10.5,color:T.accent,textDecoration:'none'}}>
                {row.v.slice(0,16)}…{row.v.slice(-6)} ↗
              </a>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ─── Create Stream Page ───────────────────────────────────────

const CREATE_STEPS = ['Token', 'Recipient & Amount', 'Schedule', 'Review & Deploy'];

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate()+n); return r.toISOString().slice(0,10);
}
const _today = new Date();

function CreateStreamPage({ setPage }: { setPage:(p:string)=>void }) {
  const { publicKey } = useWallet();
  const { createStream: doCreate } = useProgram();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    mint:      '',
    recipient: '',
    amount:    '',
    startDate: addDays(_today, 0),
    endDate:   addDays(_today, 365),
    cliffDate: '',
  });
  const [txState, setTxState] = useState<TxState>('idle');
  const [txError, setTxError] = useState('');
  const [txSig,   setTxSig]   = useState('');
  const upd = (k: string, v: string) => setForm(f=>({...f,[k]:v}));

  if (!publicKey) return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <TopBar title="Create Stream" sub="Lock tokens into a vesting schedule"
        actions={<Btn variant="ghost" size="sm" onClick={()=>setPage('dashboard')}>← Cancel</Btn>}/>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
        flexDirection:'column', gap:20 }}>
        <div style={{ fontSize:40 }}>🔒</div>
        <div style={{ fontFamily:T.serif, fontSize:20, color:'#fff' }}>Wallet Required</div>
        <div style={{ fontSize:13, color:T.muted }}>Connect Phantom or Solflare to create streams</div>
        <WalletMultiButton style={{ background:`linear-gradient(135deg,${T.accent},${T.accentDk})`, borderRadius:11 }}/>
      </div>
    </div>
  );

  function validate(): string {
    if (step===0) {
      if (!form.mint) return 'Enter a SPL token mint address';
      try { new PublicKey(form.mint); } catch { return 'Invalid mint address — must be a base58 Solana pubkey'; }
    }
    if (step===1) {
      if (!form.recipient) return 'Enter recipient wallet address';
      try { new PublicKey(form.recipient); } catch { return 'Invalid recipient address — must be a base58 Solana pubkey'; }
      if (Number(form.amount) <= 0) return 'Enter a valid amount greater than 0';
      if (publicKey && form.recipient === publicKey.toBase58()) return 'Creator and recipient cannot be the same wallet';
    }
    if (step===2) {
      if (!form.startDate) return 'Select a start date';
      if (!form.endDate)   return 'Select an end date';
      if (form.endDate <= form.startDate) return 'End date must be after start date';
      if (form.cliffDate && form.cliffDate >= form.endDate) return 'Cliff must be before end date';
    }
    return '';
  }

  async function handleDeploy() {
    const err = validate();
    if (err) { setTxError(err); setTxState('error'); return; }
    setTxState('approving'); setTxError(''); setTxSig('');
    try {
      const mintPk       = new PublicKey(form.mint);
      const recipientPk  = new PublicKey(form.recipient);
      const totalAmount  = new BN(Math.round(Number(form.amount) * 1_000_000));
      const startTime    = new BN(Math.floor(new Date(form.startDate).getTime()/1000));
      const endTime      = new BN(Math.floor(new Date(form.endDate).getTime()/1000));
      const cliffTime    = form.cliffDate ? new BN(Math.floor(new Date(form.cliffDate).getTime()/1000)) : new BN(0);
      const seed         = new BN(Date.now());

      setTxState('sending');
      const milestoneEnabled = form.cliffDate !== '';
      const { txSig: sig } = await doCreate({
        recipientPk, mint: mintPk,
        totalAmount, startTime, endTime, cliffTime, seed,
        milestoneEnabled,
      });
      setTxState('confirming'); await new Promise(r=>setTimeout(r,1500));
      setTxSig(sig); setTxState('success');
    } catch (e) {
      setTxError(parseAnchorError(e)); setTxState('error');
    }
  }

  const validationErr = validate();

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <TopBar title="Create Stream" sub="Lock tokens into a vesting schedule on-chain"
        actions={<Btn variant="ghost" size="sm" onClick={()=>setPage('dashboard')}>← Cancel</Btn>}/>

      <div style={{ flex:1, overflowY:'auto', padding:'24px 28px', display:'flex', flexDirection:'column', gap:20 }}>
        <TxLoadingBanner state={txState} error={txError} sig={txSig}/>

        {txState==='success' ? (
          <Card glow={T.green} style={{ textAlign:'center', padding:'40px 24px' }}>
            <div style={{ fontSize:48 }}>🎉</div>
            <div style={{ fontFamily:T.serif, fontSize:22, color:T.green, margin:'12px 0 6px' }}>Stream Created!</div>
            <div style={{ fontSize:13, color:T.muted, marginBottom:20 }}>Tokens locked on Solana Devnet</div>
            {txSig&&(
              <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank" rel="noreferrer"
                style={{ display:'block', fontSize:12, color:T.accent, textDecoration:'underline', marginBottom:20 }}>
                View on Explorer ↗
              </a>
            )}
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <Btn variant="primary" onClick={()=>setPage('dashboard')}>View Dashboard</Btn>
              <Btn variant="ghost" onClick={()=>{
                setStep(0); setTxState('idle'); setTxSig('');
                setForm({mint:'',recipient:'',amount:'',startDate:addDays(_today,0),endDate:addDays(_today,365),cliffDate:''});
              }}>Create Another</Btn>
            </div>
          </Card>
        ) : (
          <>
            {/* Step indicators */}
            <div style={{ display:'flex', alignItems:'center', gap:0 }}>
              {CREATE_STEPS.map((s,i)=>(
                <React.Fragment key={i}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, cursor:i<=step?'pointer':'default' }}
                    onClick={()=>i<=step&&setStep(i)}>
                    <div style={{ width:28,height:28,borderRadius:'50%',
                      background:step===i?T.accent:i<step?T.green:'rgba(255,255,255,.08)',
                      border:`1.5px solid ${step===i?T.accent:i<step?T.green:'rgba(255,255,255,.12)'}`,
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:12,color:'#fff',fontWeight:700,transition:'all .25s',
                      boxShadow:step===i?`0 0 14px ${T.accent}66`:'none' }}>
                      {i<step?'✓':i+1}
                    </div>
                    <span style={{ fontSize:12,color:step===i?'#fff':i<step?T.green:T.muted,
                      fontWeight:step===i?600:400,whiteSpace:'nowrap' }}>{s}</span>
                  </div>
                  {i<CREATE_STEPS.length-1&&(
                    <div style={{ flex:1,height:1,margin:'0 8px',background:i<step?T.green:T.border }}/>
                  )}
                </React.Fragment>
              ))}
            </div>

            <Card style={{ maxWidth:600 }}>
              {/* Step 0: Token */}
              {step===0&&(
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div style={{ fontFamily:T.serif, fontSize:15, color:'#fff', marginBottom:4 }}>Select Token</div>
                  <div>
                    <label style={{ fontSize:12, color:T.muted, display:'block', marginBottom:6 }}>
                      SPL Token Mint Address *
                    </label>
                    <input value={form.mint} onChange={e=>upd('mint',e.target.value)}
                      placeholder="Devnet SPL mint address (base58)"
                      style={{ width:'100%',padding:'10px 14px',borderRadius:10,background:T.bg1,
                        border:`1px solid ${T.border}`,color:'#fff',fontSize:13,outline:'none',
                        fontFamily:T.mono, boxSizing:'border-box' }}/>
                  </div>
                  <div style={{ padding:'12px 14px', background:`${T.gold}08`,
                    border:`1px solid ${T.gold}22`, borderRadius:10 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:T.gold, marginBottom:6 }}>
                      💡 Need a devnet token?
                    </div>
                    <div style={{ fontSize:11, color:T.muted, lineHeight:1.8 }}>
                      1. Create mint:{' '}
                      <code style={{ fontFamily:T.mono, color:T.accent }}>
                        spl-token create-token --url devnet
                      </code><br/>
                      2. Create account:{' '}
                      <code style={{ fontFamily:T.mono, color:T.accent }}>
                        spl-token create-account &lt;MINT&gt; --url devnet
                      </code><br/>
                      3. Mint tokens:{' '}
                      <code style={{ fontFamily:T.mono, color:T.accent }}>
                        spl-token mint &lt;MINT&gt; 1000000 --url devnet
                      </code>
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:T.muted }}>
                    Amount will be multiplied by 10⁶ (6 decimals assumed).
                  </div>
                </div>
              )}

              {/* Step 1: Recipient & Amount */}
              {step===1&&(
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div style={{ fontFamily:T.serif, fontSize:15, color:'#fff', marginBottom:4 }}>
                    Recipient & Amount
                  </div>
                  <div>
                    <label style={{ fontSize:12, color:T.muted, display:'block', marginBottom:6 }}>
                      Recipient Wallet Address *
                    </label>
                    <input value={form.recipient} onChange={e=>upd('recipient',e.target.value)}
                      placeholder="Solana wallet address (base58)"
                      style={{ width:'100%',padding:'10px 14px',borderRadius:10,background:T.bg1,
                        border:`1px solid ${T.border}`,color:'#fff',fontSize:13,outline:'none',
                        fontFamily:T.mono, boxSizing:'border-box' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:12, color:T.muted, display:'block', marginBottom:6 }}>
                      Amount (token units) *
                    </label>
                    <input value={form.amount} onChange={e=>upd('amount',e.target.value)}
                      placeholder="e.g. 100000" type="number" min="1"
                      style={{ width:'100%',padding:'10px 14px',borderRadius:10,background:T.bg1,
                        border:`1px solid ${T.border}`,color:'#fff',fontSize:13,outline:'none',
                        boxSizing:'border-box' }}/>
                  </div>
                  {Number(form.amount)>0&&(
                    <div style={{ padding:'10px 14px', background:'rgba(255,255,255,.04)',
                      borderRadius:10, border:`1px solid ${T.border}`, fontSize:12 }}>
                      <div style={{ color:T.muted }}>
                        Stream:{' '}
                        <span style={{ color:'#fff', fontFamily:T.mono }}>
                          {Number(form.amount).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ color:T.muted, marginTop:4 }}>
                        Protocol fee 1%:{' '}
                        <span style={{ color:T.gold, fontFamily:T.mono }}>
                          {Math.floor(+form.amount*0.01).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ color:T.muted, marginTop:4 }}>
                        Total deducted:{' '}
                        <span style={{ color:T.red, fontFamily:T.mono }}>
                          {Math.ceil(+form.amount*1.01).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Schedule */}
              {step===2&&(
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div style={{ fontFamily:T.serif, fontSize:15, color:'#fff', marginBottom:4 }}>
                    Vesting Schedule
                  </div>
                  {[
                    {label:'Start Date *',  key:'startDate'},
                    {label:'End Date *',    key:'endDate'  },
                    {label:'Cliff Date (optional — leave blank for linear vesting)', key:'cliffDate'},
                  ].map(f=>(
                    <div key={f.key}>
                      <label style={{ fontSize:12, color:T.muted, display:'block', marginBottom:6 }}>
                        {f.label}
                      </label>
                      <input type="date" value={form[f.key as keyof typeof form]}
                        onChange={e=>upd(f.key,e.target.value)}
                        style={{ width:'100%',padding:'10px 14px',borderRadius:10,background:T.bg1,
                          border:`1px solid ${T.border}`,color:'#fff',fontSize:13,outline:'none',
                          colorScheme:'dark', boxSizing:'border-box' }}/>
                    </div>
                  ))}
                  <div style={{ padding:'12px 14px', background:T.bg1, borderRadius:10,
                    border:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:11, color:T.muted }}>Preview</div>
                    <div style={{ fontFamily:T.mono, fontSize:12, color:'#fff', marginTop:6, lineHeight:1.8 }}>
                      Start: {form.startDate||'—'}
                      {form.cliffDate&&<><br/>Cliff: {form.cliffDate}</>}
                      <br/>End: {form.endDate||'—'}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Review */}
              {step===3&&(
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  <div style={{ fontFamily:T.serif, fontSize:15, color:'#fff', marginBottom:4 }}>
                    Review & Deploy
                  </div>
                  {[
                    {l:'Mint',       v:form.mint.slice(0,20)+'…'},
                    {l:'Recipient',  v:form.recipient.slice(0,20)+'…'},
                    {l:'Amount',     v:`${Number(form.amount).toLocaleString()} tokens`},
                    {l:'Start Date', v:form.startDate},
                    {l:'End Date',   v:form.endDate},
                    {l:'Cliff Date', v:form.cliffDate||'None (linear vesting)'},
                    {l:'Protocol fee (1%)', v:`${Math.floor(+form.amount*0.01).toLocaleString()} tokens`},
                  ].map(r=>(
                    <div key={r.l} style={{ display:'flex', justifyContent:'space-between',
                      padding:'9px 0', borderBottom:`1px solid ${T.border}` }}>
                      <span style={{ fontSize:12, color:T.muted }}>{r.l}</span>
                      <span style={{ fontSize:12, color:'#fff', fontFamily:T.mono,
                        maxWidth:240, textAlign:'right', wordBreak:'break-all' }}>{r.v}</span>
                    </div>
                  ))}
                  <Btn variant="primary" size="lg" full onClick={handleDeploy}
                    disabled={txState!=='idle'}>
                    {txState==='approving' ? 'Approve in wallet…'
                      : txState==='sending'    ? 'Sending…'
                      : txState==='confirming' ? 'Confirming…'
                      : '🚀 Deploy Stream to Devnet'}
                  </Btn>
                  <div style={{ fontSize:11, color:T.muted, textAlign:'center' }}>
                    Real transaction · Solana Devnet
                  </div>
                </div>
              )}
            </Card>

            {/* Nav buttons */}
            <div style={{ display:'flex', gap:10, maxWidth:600 }}>
              <Btn variant="ghost" onClick={()=>step>0?setStep(s=>s-1):setPage('dashboard')}
                style={{ flex:1 }}>
                {step===0?'Cancel':'← Back'}
              </Btn>
              {step<CREATE_STEPS.length-1&&(
                <Btn variant="primary" style={{ flex:2 }}
                  onClick={()=>{
                    const err = validate();
                    if (err) { alert(err); } else { setStep(s=>s+1); }
                  }}>
                  Next →
                </Btn>
              )}
            </div>
          </>
        )}
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
            {n:'01', col:T.gold,  icon:'🔒', title:'Cliff Gate',    desc:'Tokens locked until cliff_end timestamp. Zero withdrawals. Anti-bot by default.'},
            {n:'02', col:T.blue,  icon:'🏁', title:'Milestone',     desc:'Creator confirms KPI completion on-chain. Quota allocated per milestone hit.'},
            {n:'03', col:T.green, icon:'📈', title:'Linear Stream', desc:'Stream flows continuously once conditions are met. Claim anytime.'},
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
    { type:'Linear',    pct:44, col:T.accent,  n:812 },
    { type:'Milestone', pct:28, col:T.blue,    n:515 },
    { type:'Cliff',     pct:18, col:T.gold,    n:331 },
    { type:'Hybrid',    pct:10, col:'#c084fc', n:182 },
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
                  <tr key={s.id} style={{ borderTop:`1px solid ${T.border}`,
                    background:i%2?'rgba(255,255,255,.01)':'transparent' }}>
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

        {/* Stream selector */}
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
                  outline:'none', fontFamily:T.mono, marginTop:4, marginBottom:8, boxSizing:'border-box' }}/>
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
      <TopBar title="Audit Trail"
        sub="Immutable on-chain event log · Full protocol history · Investor-grade transparency"/>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 28px', display:'flex', flexDirection:'column', gap:14 }}>

        {/* Summary */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            { l:'Total Events',    v:AUDIT_LOG.length,                                                        c:T.accent },
            { l:'Streams Created', v:AUDIT_LOG.filter((e:AuditEvent)=>e.action==='create_stream').length,     c:T.green },
            { l:'Withdrawals',     v:AUDIT_LOG.filter((e:AuditEvent)=>e.action==='withdraw').length,           c:T.gold  },
            { l:'Failed Txns',     v:AUDIT_LOG.filter((e:AuditEvent)=>e.status==='failed').length,             c:T.red   },
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
                    <td style={{ padding:'9px 16px', fontFamily:T.mono, fontSize:11,
                      color:e.amount>0 ? T.gold : T.muted }}>
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

// ─── Root App ─────────────────────────────────────────────────

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
