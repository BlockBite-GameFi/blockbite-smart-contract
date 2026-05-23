// Mock stream data — replace with real on-chain data in Week 7+
export const MOCK_WALLET = '0x3f7a…c9b2';

export type AuditStatus = 'success' | 'failed';

export interface AuditEvent {
  ts: string;
  action: string;
  stream: string;
  actor: string;
  amount: number;
  tx: string;
  status: AuditStatus;
}

export const AUDIT_LOG: AuditEvent[] = [
  {ts:'2025-05-21 14:32:01',action:'withdraw',          stream:'s001',actor:MOCK_WALLET,         amount:20000,  tx:'5xKj…Bq7r',status:'success'},
  {ts:'2025-05-20 09:15:44',action:'milestone_verified', stream:'s002',actor:MOCK_WALLET,         amount:0,      tx:'3mNp…Yw2s',status:'success'},
  {ts:'2025-05-18 22:08:12',action:'withdraw',           stream:'s001',actor:MOCK_WALLET,         amount:20000,  tx:'8hQr…Tv4u',status:'success'},
  {ts:'2025-05-15 11:44:33',action:'create_stream',      stream:'s005',actor:MOCK_WALLET,         amount:750000, tx:'2aLw…Xz9v',status:'success'},
  {ts:'2025-05-10 08:23:17',action:'cancel_attempt',     stream:'s003',actor:'0xF88a…2D1b',       amount:0,      tx:'7bMc…Pk3w',status:'failed'},
  {ts:'2025-04-28 16:55:02',action:'create_stream',      stream:'s002',actor:MOCK_WALLET,         amount:120000, tx:'4cNd…Rj5x',status:'success'},
  {ts:'2025-04-15 13:10:48',action:'create_stream',      stream:'s001',actor:MOCK_WALLET,         amount:500000, tx:'6dOe…Sl6y',status:'success'},
  {ts:'2025-03-01 00:00:00',action:'cliff_expired',      stream:'s002',actor:'PROTOCOL',          amount:0,      tx:'1ePf…Tm7z',status:'success'},
  {ts:'2025-02-14 09:00:00',action:'create_stream',      stream:'s004',actor:'0xD44c…5B1a',       amount:200000, tx:'9fQg…Un8a',status:'success'},
];

export type StreamType = 'linear' | 'milestone' | 'cliff' | 'hybrid';
export type StreamStatus = 'active' | 'pending' | 'completed' | 'cancelled';

export interface Stream {
  id: string;
  name: string;
  token: string;
  total: number;
  claimed: number;
  unlocked: number;
  cliff: string;
  end: string;
  type: StreamType;
  recipient: string;
  creator: string;
  status: StreamStatus;
  vestDays: number;
  cliffDays: number;
  milestones: { label: string; pct: number; done: boolean; date: string }[];
}

export const STREAMS: Stream[] = [
  { id:'s001', name:'Team Allocation',    token:'BBT', total:500000, claimed:80000,  unlocked:140000,
    cliff:'2025-06-01', end:'2027-01-01', type:'linear',    recipient:'0xA12b…3F9c', creator:MOCK_WALLET,
    status:'active',   vestDays:365, cliffDays:90,  milestones:[] },
  { id:'s002', name:'Advisor Round',      token:'BBT', total:120000, claimed:12000,  unlocked:30000,
    cliff:'2025-03-15', end:'2026-03-15', type:'milestone', recipient:'0xB55a…1D3e', creator:MOCK_WALLET,
    status:'active',   vestDays:180, cliffDays:30,
    milestones:[
      {label:'Token Launch', pct:25, done:true,  date:'2025-03-01'},
      {label:'10K Players',  pct:25, done:false, date:'2025-09-01'},
      {label:'Mainnet',      pct:25, done:false, date:'2025-12-01'},
      {label:'Protocol V2',  pct:25, done:false, date:'2026-06-01'},
    ]},
  { id:'s003', name:'Ecosystem Fund',     token:'BBT', total:1000000,claimed:0,      unlocked:0,
    cliff:'2026-01-01', end:'2028-01-01', type:'cliff',     recipient:MOCK_WALLET,   creator:'0xC99d…8A2f',
    status:'pending',  vestDays:730, cliffDays:180, milestones:[] },
  { id:'s004', name:'Player Rewards S1',  token:'BBT', total:200000, claimed:200000, unlocked:200000,
    cliff:'2024-09-01', end:'2025-03-01', type:'linear',    recipient:MOCK_WALLET,   creator:'0xD44c…5B1a',
    status:'completed',vestDays:180, cliffDays:0,   milestones:[] },
  { id:'s005', name:'VC Seed Round',      token:'BBT', total:750000, claimed:0,      unlocked:0,
    cliff:'2025-12-01', end:'2027-12-01', type:'hybrid',    recipient:'0xE72f…9C4b', creator:MOCK_WALLET,
    status:'active',   vestDays:730, cliffDays:180, milestones:[] },
];
