/**
 * lib/i18n.ts — Bilingual (EN / ID) page-level translations
 *
 * Usage:
 *   import { I18N } from '@/lib/i18n';
 *   import { useApp } from '@/lib/useApp';
 *
 *   const { lang } = useApp();
 *   const tx = I18N[lang].streams;   // pick page namespace
 *   // then: <h1>{tx.title}</h1>
 */

import type { Lang } from '@/lib/useApp';

// ─── Shared / common strings ─────────────────────────────────────────────────
const common = {
  en: {
    connectWallet:   'Connect Wallet',
    connectWalletCta:'Connect Wallet →',
    loading:         'Loading…',
    retry:           'Retry',
    viewDemo:        'View Demo →',
    createStream:    'Create Stream',
    viewAllStreams:   'View all streams →',
    demo:            'Demo ↗',
    refresh:         '↻ Refresh',
    cancel:          'Cancel',
    back:            '←',
    playGame:        '▶ Play Game',
    viewExplorer:    'View on Explorer ↗',
    tdpProtocol:     'TDP Protocol · Devnet',
  },
  id: {
    connectWallet:   'Hubungkan Wallet',
    connectWalletCta:'Hubungkan Wallet →',
    loading:         'Memuat…',
    retry:           'Coba Lagi',
    viewDemo:        'Lihat Demo →',
    createStream:    'Buat Stream',
    viewAllStreams:   'Lihat semua stream →',
    demo:            'Demo ↗',
    refresh:         '↻ Perbarui',
    cancel:          'Batalkan',
    back:            '←',
    playGame:        '▶ Main Game',
    viewExplorer:    'Lihat di Explorer ↗',
    tdpProtocol:     'Protokol TDP · Devnet',
  },
} as const;

// ─── Page namespaces ──────────────────────────────────────────────────────────

const streams = {
  en: {
    badge:       'TDP Protocol · Devnet',
    title:       'Token Streams',
    subtitle:    'Cliff · linear · milestone vesting streams. Each stream is a PDA vault on Solana devnet.',
    createBtn:   '+ Create Stream',
    demoBtn:     '◈ View Demo',
    kpi: {
      streams:  'Your Streams',
      streamsSub: 'as creator or recipient',
      active:   'Active',
      activeSub: 'currently streaming',
      locked:   'Total Locked',
      lockedSub: 'across your streams',
      claimed:  'Total Claimed',
      claimedSub: 'all-time withdrawn',
    },
    walletTitle: 'Connect wallet to see your streams',
    walletSub:   "Your streams will appear here — streams you created and streams you're a beneficiary of.",
    connectBtn:  'Connect Wallet',
    orDemo:      'Or explore the demo →',
    loadingMsg:  'Loading streams from Solana devnet…',
    filterAll:       'All',
    filterActive:    'Active',
    filterPending:   'Pending',
    filterCompleted: 'Completed',
    filterCancelled: 'Cancelled',
    streamCount: (n: number) => `${n} stream${n !== 1 ? 's' : ''} · click a row to view details`,
    noMatch:     'No streams match this filter.',
    createFirst: 'Create your first stream →',
    headers:     ['STREAM / ROLE', 'TYPE', 'TOTAL TOKENS', 'CREATOR / TEAM', 'DATE CREATED', 'STATUS'],
    youCreated:  'You created',
    youReceive:  'You receive',
    milestone:   (n: number) => `${n} milestone${n !== 1 ? 's' : ''}`,
    tableFooter: 'Live on-chain data · Solana devnet · Click any row to view details, claim, or cancel',
    quickTitle:  'Quick Actions',
    quickItems: [
      { label: 'Create New Stream',  desc: 'Lock tokens into a PDA vault',     href: '/streams/new' },
      { label: 'Claim Tokens',       desc: 'Withdraw vested tokens',            href: '/claim' },
      { label: 'Verify Milestone',   desc: 'Unlock milestone allocation',       href: '/milestones' },
      { label: 'Vesting Calculator', desc: 'Model distribution schedule',       href: '/calculator' },
      { label: 'View Demo',          desc: 'Simulated data walkthrough',        href: '/demo' },
    ],
  },
  id: {
    badge:       'Protokol TDP · Devnet',
    title:       'Stream Token',
    subtitle:    'Stream vesting cliff · linear · milestone. Setiap stream adalah PDA vault di Solana devnet.',
    createBtn:   '+ Buat Stream',
    demoBtn:     '◈ Lihat Demo',
    kpi: {
      streams:  'Stream Kamu',
      streamsSub: 'sebagai pembuat atau penerima',
      active:   'Aktif',
      activeSub: 'sedang streaming',
      locked:   'Total Terkunci',
      lockedSub: 'di semua stream kamu',
      claimed:  'Total Diklaim',
      claimedSub: 'total penarikan',
    },
    walletTitle: 'Hubungkan wallet untuk melihat stream kamu',
    walletSub:   'Stream kamu akan muncul di sini — stream yang kamu buat dan stream yang kamu terima.',
    connectBtn:  'Hubungkan Wallet',
    orDemo:      'Atau jelajahi demo →',
    loadingMsg:  'Memuat stream dari Solana devnet…',
    filterAll:       'Semua',
    filterActive:    'Aktif',
    filterPending:   'Menunggu',
    filterCompleted: 'Selesai',
    filterCancelled: 'Dibatalkan',
    streamCount: (n: number) => `${n} stream · klik baris untuk lihat detail`,
    noMatch:     'Tidak ada stream yang cocok dengan filter ini.',
    createFirst: 'Buat stream pertama kamu →',
    headers:     ['STREAM / PERAN', 'TIPE', 'TOTAL TOKEN', 'KREATOR / TIM', 'TGL DIBUAT', 'STATUS'],
    youCreated:  'Kamu buat',
    youReceive:  'Kamu terima',
    milestone:   (n: number) => `${n} milestone`,
    tableFooter: 'Data on-chain langsung · Solana devnet · Klik baris untuk lihat detail, klaim, atau batalkan',
    quickTitle:  'Aksi Cepat',
    quickItems: [
      { label: 'Buat Stream Baru',   desc: 'Kunci token ke PDA vault',          href: '/streams/new' },
      { label: 'Klaim Token',        desc: 'Tarik token vesting',               href: '/claim' },
      { label: 'Verifikasi Milestone', desc: 'Buka alokasi milestone',          href: '/milestones' },
      { label: 'Kalkulator Vesting', desc: 'Simulasi jadwal distribusi',        href: '/calculator' },
      { label: 'Lihat Demo',         desc: 'Panduan data simulasi',             href: '/demo' },
    ],
  },
} as const;

const claim = {
  en: {
    badge:         'TDP · Claim Portal',
    title:         'Claim Vested Tokens',
    subtitle:      'Withdraw your vested tokens from on-chain PDA vaults. Amounts are calculated from the live blockchain state.',
    demoLink:      'Explore demo mode →',
    walletTitle:   'Connect wallet to claim',
    walletSub:     'Connect the wallet that is the beneficiary of a stream to see your claimable tokens.',
    connectBtn:    'Connect Wallet',
    loadingMsg:    'Loading your streams from Solana devnet…',
    noStreamsTitle: 'No streams found',
    noStreamsSub:  'No vesting streams where this wallet is the beneficiary were found on devnet.',
    createStream:  'Create a stream',
    viewDemo:      'View demo',
    progressLabel: 'Progress',
    unlockedPct:   (p: number) => `${p.toFixed(1)}% unlocked`,
    statsLabels: {
      total:     'Total Locked',
      withdrawn: 'Withdrawn',
      claimable: 'Claimable Now',
    },
    cliffLabel: 'Cliff',
    endLabel:   'End',
    pendingWarning: (date: string) => `⏱ Cliff has not passed yet. Tokens will begin unlocking on ${date}.`,
    claimedSuccess: '✓ Claimed successfully!',
    gameGateWarning: '⚠ Play the game first to claim tokens',
    btnApproving:   'Waiting for wallet approval…',
    btnConfirming:  'Confirming on chain…',
    btnGameGate:    'Play game to unlock claim',
    btnCliffNotMet: 'Cliff not reached',
    btnNoClaim:     'Nothing to claim',
    btnClaim:       (amt: string) => `Claim ${amt} TOKEN`,
    footerNote:     'Solana devnet · Tokens released directly to your wallet',
    unlocked:       'Unlocked',
    claimed:        'Claimed',
  },
  id: {
    badge:         'TDP · Portal Klaim',
    title:         'Klaim Token Vesting',
    subtitle:      'Tarik token vesting kamu dari PDA vault on-chain. Jumlah dihitung dari status blockchain secara langsung.',
    demoLink:      'Jelajahi mode demo →',
    walletTitle:   'Hubungkan wallet untuk klaim',
    walletSub:     'Hubungkan wallet yang menjadi penerima stream untuk melihat token yang bisa diklaim.',
    connectBtn:    'Hubungkan Wallet',
    loadingMsg:    'Memuat stream kamu dari Solana devnet…',
    noStreamsTitle: 'Stream tidak ditemukan',
    noStreamsSub:  'Tidak ada stream vesting di mana wallet ini sebagai penerima yang ditemukan di devnet.',
    createStream:  'Buat stream',
    viewDemo:      'Lihat demo',
    progressLabel: 'Progres',
    unlockedPct:   (p: number) => `${p.toFixed(1)}% terbuka`,
    statsLabels: {
      total:     'Total Terkunci',
      withdrawn: 'Ditarik',
      claimable: 'Bisa Diklaim Sekarang',
    },
    cliffLabel: 'Cliff',
    endLabel:   'Berakhir',
    pendingWarning: (date: string) => `⏱ Cliff belum terlampaui. Token mulai dibuka pada ${date}.`,
    claimedSuccess: '✓ Berhasil diklaim!',
    gameGateWarning: '⚠ Main game dulu untuk klaim token',
    btnApproving:   'Menunggu persetujuan wallet…',
    btnConfirming:  'Mengonfirmasi di blockchain…',
    btnGameGate:    'Main game untuk buka klaim',
    btnCliffNotMet: 'Cliff belum tercapai',
    btnNoClaim:     'Tidak ada yang diklaim',
    btnClaim:       (amt: string) => `Klaim ${amt} TOKEN`,
    footerNote:     'Solana devnet · Token langsung ke wallet kamu',
    unlocked:       'Terbuka',
    claimed:        'Diklaim',
  },
} as const;

const milestones = {
  en: {
    badge:       'TDP · Verification Layer',
    title:       'Milestone Verification Layer',
    subtitle:    'Projects choose their verification method. All methods enforceable on-chain via the TDP smart contract.',
    backStreams:  '← Streams',
    sectionHeader: 'Select Verification Method',
    walletTitle: 'Connect Wallet to View Your Streams',
    walletSub:   'Milestone verification is available to stream creators. Connect to see the streams you manage.',
    connectBtn:  'Connect Wallet',
    loadingMsg:  'Fetching your streams from Solana devnet…',
    noStreamsTitle: 'No Streams Found',
    noStreamsSub:  "You haven't created any streams yet.",
    upgradeTitle: 'Milestone Gates — Awaiting Program Upgrade (devnet v0.1.0)',
    upgradeSub:   'The deployed devnet program uses linear vesting only. configure_milestones / verify_milestone deploy in the next release.',
    streamDetails: 'Stream Details',
    claimFormula:  'Claimable Formula',
    noMilestonesTitle: 'No Milestone Gates Configured',
    noMilestonesSub:   'This stream uses linear vesting only. Milestone gates are added via configure_milestones after the program upgrade deploys.',
    related:       'Related',
    relatedLinks: [
      { href: '/claim',     label: 'Claim Portal' },
      { href: '/streams',   label: 'All Streams' },
      { href: '/analytics', label: 'Protocol Analytics' },
      { href: '/audit',     label: 'Audit Trail' },
      { href: '/game',      label: 'Play & Verify' },
    ],
    statusLabels: { cancelled: 'Cancelled', active: 'Active', ended: 'Ended' },
    streamLabels: {
      status: 'Status', start: 'Start', cliff: 'Cliff', end: 'End', streamId: 'Stream ID',
    },
    milestoneLabel: (i: number) => `Milestone ${i + 1}`,
    pendingVerif: 'Pending verification',
    verifiedOnChain: '✓ Verified on-chain',
    awaitingUpgrade: 'Awaiting upgrade',
    viewAuditTrail: 'View Audit Trail ↗',
    seeDemo:        'See Demo →',
    viewAudit:      'View Audit Trail ↗',
  },
  id: {
    badge:       'TDP · Lapisan Verifikasi',
    title:       'Lapisan Verifikasi Milestone',
    subtitle:    'Proyek memilih metode verifikasi. Semua metode dapat diterapkan on-chain melalui smart contract TDP.',
    backStreams:  '← Stream',
    sectionHeader: 'Pilih Metode Verifikasi',
    walletTitle: 'Hubungkan Wallet untuk Melihat Stream Kamu',
    walletSub:   'Verifikasi milestone tersedia untuk pembuat stream. Hubungkan untuk melihat stream yang kamu kelola.',
    connectBtn:  'Hubungkan Wallet',
    loadingMsg:  'Mengambil stream kamu dari Solana devnet…',
    noStreamsTitle: 'Tidak Ada Stream',
    noStreamsSub:  'Kamu belum membuat stream apa pun.',
    upgradeTitle: 'Milestone Gates — Menunggu Pembaruan Program (devnet v0.1.0)',
    upgradeSub:   'Program devnet yang di-deploy hanya menggunakan linear vesting. configure_milestones / verify_milestone akan di-deploy di rilis berikutnya.',
    streamDetails: 'Detail Stream',
    claimFormula:  'Formula Klaim',
    noMilestonesTitle: 'Tidak Ada Milestone Gate Dikonfigurasi',
    noMilestonesSub:   'Stream ini hanya menggunakan linear vesting. Milestone gate ditambahkan via configure_milestones setelah pembaruan program di-deploy.',
    related:       'Terkait',
    relatedLinks: [
      { href: '/claim',     label: 'Portal Klaim' },
      { href: '/streams',   label: 'Semua Stream' },
      { href: '/analytics', label: 'Analitik Protokol' },
      { href: '/audit',     label: 'Jejak Audit' },
      { href: '/game',      label: 'Main & Verifikasi' },
    ],
    statusLabels: { cancelled: 'Dibatalkan', active: 'Aktif', ended: 'Selesai' },
    streamLabels: {
      status: 'Status', start: 'Mulai', cliff: 'Cliff', end: 'Berakhir', streamId: 'ID Stream',
    },
    milestoneLabel: (i: number) => `Milestone ${i + 1}`,
    pendingVerif: 'Menunggu verifikasi',
    verifiedOnChain: '✓ Terverifikasi on-chain',
    awaitingUpgrade: 'Menunggu pembaruan',
    viewAuditTrail: 'Lihat Jejak Audit ↗',
    seeDemo:        'Lihat Demo →',
    viewAudit:      'Lihat Jejak Audit ↗',
  },
} as const;

const campaigns = {
  en: {
    badge:       'TDP · Recipient Dashboard',
    title:       'My Campaigns',
    subtitle:    'Campaigns you have been added to as a token recipient.',
    createBtn:   '+ Create Campaign',
    walletTitle: 'Connect Your Wallet',
    walletSub:   'Connect your Solana wallet to see campaigns you have been invited to as a recipient.',
    connectBtn:  'Connect Wallet →',
    noCampaigns: 'No campaigns found for this wallet. Ask your campaign creator to add your address.',
    viewStreams:  'View all streams →',
    yourAlloc:   'Your Allocation',
    allocProgress: 'Allocation progress',
    verified:    'Verified — ready to claim',
    pendingVerif: 'Pending game verification',
    viewDetails: 'View details →',
  },
  id: {
    badge:       'TDP · Dasbor Penerima',
    title:       'Kampanye Saya',
    subtitle:    'Kampanye di mana kamu ditambahkan sebagai penerima token.',
    createBtn:   '+ Buat Kampanye',
    walletTitle: 'Hubungkan Wallet Kamu',
    walletSub:   'Hubungkan wallet Solana kamu untuk melihat kampanye yang kamu diundang sebagai penerima.',
    connectBtn:  'Hubungkan Wallet →',
    noCampaigns: 'Tidak ada kampanye untuk wallet ini. Minta pembuat kampanye untuk menambahkan alamat kamu.',
    viewStreams:  'Lihat semua stream →',
    yourAlloc:   'Alokasi Kamu',
    allocProgress: 'Progres alokasi',
    verified:    'Terverifikasi — siap diklaim',
    pendingVerif: 'Menunggu verifikasi game',
    viewDetails: 'Lihat detail →',
  },
} as const;

const analytics = {
  en: {
    badge:      'TDP · Protocol Analytics',
    title:      'Protocol Analytics',
    subtitle:   'On-chain metrics aggregated across all vesting streams on Solana devnet.',
    exportCsv:  '↓ Export CSV',
    methodology:'Single Source of Truth — Internal Tracker',
    noWallet:   'Connect wallet to see your personal analytics.',
    loading:    'Loading on-chain data…',
  },
  id: {
    badge:      'TDP · Analitik Protokol',
    title:      'Analitik Protokol',
    subtitle:   'Metrik on-chain yang dikumpulkan dari semua stream vesting di Solana devnet.',
    exportCsv:  '↓ Ekspor CSV',
    methodology:'Satu Sumber Kebenaran — Pelacak Internal',
    noWallet:   'Hubungkan wallet untuk melihat analitik personal kamu.',
    loading:    'Memuat data on-chain…',
  },
} as const;

const audit = {
  en: {
    badge:     'TDP · Audit Trail',
    title:     'Audit Trail',
    subtitle:  'Immutable event log. Every on-chain action is recorded and verifiable on Solana devnet.',
    exportCsv: '↓ Export CSV',
    loading:   'Loading on-chain events…',
    noEvents:  'No on-chain events found for this wallet.',
    connectMsg: 'Connect wallet to see your audit trail.',
    eventTypes: {
      created:   'Stream Created',
      withdrawn: 'Tokens Withdrawn',
      cancelled: 'Stream Cancelled',
      milestone: 'Milestone Verified',
    },
  },
  id: {
    badge:     'TDP · Jejak Audit',
    title:     'Jejak Audit',
    subtitle:  'Log peristiwa tidak berubah. Setiap aksi on-chain dicatat dan dapat diverifikasi di Solana devnet.',
    exportCsv: '↓ Ekspor CSV',
    loading:   'Memuat peristiwa on-chain…',
    noEvents:  'Tidak ada peristiwa on-chain untuk wallet ini.',
    connectMsg: 'Hubungkan wallet untuk melihat jejak audit kamu.',
    eventTypes: {
      created:   'Stream Dibuat',
      withdrawn: 'Token Ditarik',
      cancelled: 'Stream Dibatalkan',
      milestone: 'Milestone Diverifikasi',
    },
  },
} as const;

const calculator = {
  en: {
    badge:    'TDP · Vesting Calculator',
    title:    'Vesting Calculator',
    subtitle: 'Model your token distribution schedule before creating a stream on-chain.',
    calculate: 'Calculate',
    reset:     'Reset',
    schedule:  'Vesting Schedule',
    fields: {
      total:       'Total Token Amount',
      cliff:       'Cliff Period (days)',
      vest:        'Vesting Duration (days)',
      type:        'Vesting Type',
      milestones:  'Number of Milestones',
    },
    types: { linear: 'Linear', cliff: 'Cliff Only', milestone: 'Milestone', hybrid: 'Hybrid' },
    results: {
      atCliff:    'Tokens at Cliff',
      perDay:     'Tokens per Day',
      perMonth:   'Tokens per Month',
      fullVest:   'Full Vest Date',
    },
    createFromCalc: 'Create Stream with These Settings →',
  },
  id: {
    badge:    'TDP · Kalkulator Vesting',
    title:    'Kalkulator Vesting',
    subtitle: 'Simulasi jadwal distribusi token sebelum membuat stream on-chain.',
    calculate: 'Hitung',
    reset:     'Reset',
    schedule:  'Jadwal Vesting',
    fields: {
      total:       'Jumlah Token Total',
      cliff:       'Periode Cliff (hari)',
      vest:        'Durasi Vesting (hari)',
      type:        'Tipe Vesting',
      milestones:  'Jumlah Milestone',
    },
    types: { linear: 'Linear', cliff: 'Cliff Saja', milestone: 'Milestone', hybrid: 'Hybrid' },
    results: {
      atCliff:    'Token saat Cliff',
      perDay:     'Token per Hari',
      perMonth:   'Token per Bulan',
      fullVest:   'Tanggal Vesting Penuh',
    },
    createFromCalc: 'Buat Stream dengan Pengaturan Ini →',
  },
} as const;

const protocol = {
  en: {
    badge:    'TDP · Protocol Overview',
    title:    'Token Distribution Protocol',
    subtitle: 'BlockBite is the unified engine for automated token logistics.',
    launchApp: 'Launch App →',
    readDocs:  'Read Docs',
    features: [
      { title: 'Modular Verification Layers',    desc: 'Choose game-based, oracle, multisig, or manual verification per stream.' },
      { title: 'Adaptive Tokenomics Logic',      desc: 'Cliff, linear, and milestone schedules — fully configurable on-chain.' },
      { title: 'Eliminate Manual Overhead',      desc: 'Automated release logic removes the need for manual token distributions.' },
      { title: 'Active Clawback Control',        desc: 'Cancel or claw back unvested tokens at any time via signed transaction.' },
      { title: 'Professional Standard Security', desc: 'PDA vaults with program-derived authority. No admin key required.' },
    ],
  },
  id: {
    badge:    'TDP · Ikhtisar Protokol',
    title:    'Protokol Distribusi Token',
    subtitle: 'BlockBite adalah mesin terpadu untuk logistik token otomatis.',
    launchApp: 'Buka Aplikasi →',
    readDocs:  'Baca Dokumentasi',
    features: [
      { title: 'Lapisan Verifikasi Modular',     desc: 'Pilih verifikasi berbasis game, oracle, multisig, atau manual per stream.' },
      { title: 'Logika Tokenomics Adaptif',      desc: 'Jadwal cliff, linear, dan milestone — sepenuhnya dapat dikonfigurasi on-chain.' },
      { title: 'Hilangkan Overhead Manual',      desc: 'Logika pelepasan otomatis menghilangkan kebutuhan distribusi token manual.' },
      { title: 'Kontrol Clawback Aktif',         desc: 'Batalkan atau tarik kembali token yang belum vesting kapan saja via transaksi bertanda tangan.' },
      { title: 'Keamanan Standar Profesional',   desc: 'PDA vault dengan otoritas program-derived. Tidak memerlukan admin key.' },
    ],
  },
} as const;

const streamsNew = {
  en: {
    badge:    'TDP · Create Stream',
    title:    'Create Vesting Stream',
    subtitle: 'Lock tokens into a PDA vault on Solana devnet. Configure cliff, schedule, and optional milestone gates.',
    submitBtn:  'Create Stream on Devnet',
    submitting: 'Creating stream…',
    successTitle: 'Stream Created!',
    successSub:   'Your vesting stream is live on Solana devnet.',
    viewStream:   'View Stream →',
    createAnother: 'Create Another',
    fields: {
      recipient:   'Recipient Address',
      amount:      'Token Amount',
      cliff:       'Cliff Date',
      end:         'End Date',
      vestType:    'Vesting Type',
      milestones:  'Milestone Count',
      gameGate:    'Game Verification Gate',
      requiredTier:'Required Game Tier',
    },
    types: { linear: 'Linear', cliff: 'Cliff', milestone: 'Milestone', hybrid: 'Hybrid' },
    walletTitle: 'Connect Wallet to Create a Stream',
    walletSub:   'You need a connected wallet to sign the create_stream transaction on Solana devnet.',
  },
  id: {
    badge:    'TDP · Buat Stream',
    title:    'Buat Stream Vesting',
    subtitle: 'Kunci token ke PDA vault di Solana devnet. Konfigurasi cliff, jadwal, dan milestone gate opsional.',
    submitBtn:  'Buat Stream di Devnet',
    submitting: 'Membuat stream…',
    successTitle: 'Stream Dibuat!',
    successSub:   'Stream vesting kamu sudah aktif di Solana devnet.',
    viewStream:   'Lihat Stream →',
    createAnother: 'Buat Lagi',
    fields: {
      recipient:   'Alamat Penerima',
      amount:      'Jumlah Token',
      cliff:       'Tanggal Cliff',
      end:         'Tanggal Berakhir',
      vestType:    'Tipe Vesting',
      milestones:  'Jumlah Milestone',
      gameGate:    'Gate Verifikasi Game',
      requiredTier:'Tier Game yang Diperlukan',
    },
    types: { linear: 'Linear', cliff: 'Cliff', milestone: 'Milestone', hybrid: 'Hybrid' },
    walletTitle: 'Hubungkan Wallet untuk Membuat Stream',
    walletSub:   'Kamu perlu wallet terhubung untuk menandatangani transaksi create_stream di Solana devnet.',
  },
} as const;

const streamsDetail = {
  en: {
    backBtn:     '← All Streams',
    badge:       'Stream Detail',
    claimBtn:    'Claim Vested Tokens',
    cancelBtn:   'Cancel Stream',
    detailsTitle:'Stream Details',
    activityTitle:'On-Chain Activity',
    milestonesTitle: 'Milestone Gates',
    statsLabels: {
      total:     'Total Locked',
      withdrawn: 'Withdrawn',
      claimable: 'Claimable Now',
      cliff:     'Cliff',
      start:     'Start',
      end:       'End',
      type:      'Type',
      status:    'Status',
      recipient: 'Recipient',
      creator:   'Creator',
    },
    authorityBadges: {
      solo:       '⚠ SOLO AUTHORITY',
      restricted: '🔒 RESTRICTED',
    },
    cancelModal: {
      title:   'Cancel this stream?',
      sub:     'Unvested tokens will be returned to the stream creator. This action is irreversible.',
      confirm: 'Yes, Cancel Stream',
      abort:   'Keep Stream',
    },
  },
  id: {
    backBtn:     '← Semua Stream',
    badge:       'Detail Stream',
    claimBtn:    'Klaim Token Vesting',
    cancelBtn:   'Batalkan Stream',
    detailsTitle:'Detail Stream',
    activityTitle:'Aktivitas On-Chain',
    milestonesTitle: 'Milestone Gates',
    statsLabels: {
      total:     'Total Terkunci',
      withdrawn: 'Ditarik',
      claimable: 'Bisa Diklaim Sekarang',
      cliff:     'Cliff',
      start:     'Mulai',
      end:       'Berakhir',
      type:      'Tipe',
      status:    'Status',
      recipient: 'Penerima',
      creator:   'Pembuat',
    },
    authorityBadges: {
      solo:       '⚠ OTORITAS SOLO',
      restricted: '🔒 TERBATAS',
    },
    cancelModal: {
      title:   'Batalkan stream ini?',
      sub:     'Token yang belum vesting akan dikembalikan ke pembuat stream. Tindakan ini tidak bisa dibatalkan.',
      confirm: 'Ya, Batalkan Stream',
      abort:   'Pertahankan Stream',
    },
  },
} as const;

const waitlist = {
  en: {
    badge:    'COMING SOON',
    title:    'Join the BlockBite Waitlist',
    subtitle: "Be first in line when BlockBite's Token Distribution Protocol goes live.",
    placeholder: 'Enter your email address',
    submitBtn:   'Join Waitlist',
    submitting:  'Joining…',
    successTitle:'You\'re on the list!',
    successSub:  "We'll notify you when BlockBite launches.",
    privacyNote: 'No spam. Unsubscribe anytime.',
    features: {
      kicker: 'WHY JOIN EARLY',
      title:  'The complete TDP toolkit',
      items: [
        { title: 'Modular Verification Layers',    desc: 'Game, oracle, multisig, or manual verification — pick the layer that fits your security model.' },
        { title: 'Adaptive Tokenomics Logic',      desc: 'Linear, cliff, milestone, and hybrid schedules that auto-execute on-chain without human intervention.' },
        { title: 'Eliminate Manual Overhead',      desc: 'Replace spreadsheets and manual transfers with trustless smart-contract automation.' },
        { title: 'Active Clawback Control',        desc: 'Retain the right to reclaim unvested tokens via instant on-chain cancellation.' },
        { title: 'Professional Standard Security', desc: 'PDA vaults with program-derived authority — no admin keys, no custodial risk.' },
      ],
    },
    steps: {
      kicker: 'HOW IT WORKS',
      title:  '3 steps to automated token distribution',
      items: [
        { n: '01', title: 'Connect your wallet',         desc: 'Link your Solana wallet to the TDP dashboard. No account creation needed.' },
        { n: '02', title: 'Configure your stream',       desc: 'Set the recipient, token amount, cliff date, and vesting schedule in one form.' },
        { n: '03', title: 'Choose your verification',    desc: 'Choose between a simple direct claim for maximum ease, or gamified verification to act as an anti-bots filter.' },
      ],
    },
  },
  id: {
    badge:    'SEGERA HADIR',
    title:    'Daftar Waitlist BlockBite',
    subtitle: 'Jadilah yang pertama saat Token Distribution Protocol BlockBite diluncurkan.',
    placeholder: 'Masukkan alamat email kamu',
    submitBtn:   'Daftar Waitlist',
    submitting:  'Mendaftarkan…',
    successTitle:'Kamu sudah terdaftar!',
    successSub:  'Kami akan memberi tahu kamu saat BlockBite diluncurkan.',
    privacyNote: 'Tanpa spam. Bisa berhenti kapan saja.',
    features: {
      kicker: 'KENAPA DAFTAR AWAL',
      title:  'Toolkit TDP lengkap',
      items: [
        { title: 'Lapisan Verifikasi Modular',     desc: 'Verifikasi game, oracle, multisig, atau manual — pilih lapisan yang sesuai model keamanan kamu.' },
        { title: 'Logika Tokenomics Adaptif',      desc: 'Jadwal linear, cliff, milestone, dan hybrid yang dieksekusi otomatis on-chain tanpa intervensi manusia.' },
        { title: 'Hilangkan Overhead Manual',      desc: 'Ganti spreadsheet dan transfer manual dengan otomasi smart contract yang trustless.' },
        { title: 'Kontrol Clawback Aktif',         desc: 'Pertahankan hak untuk menarik kembali token yang belum vesting melalui pembatalan on-chain instan.' },
        { title: 'Keamanan Standar Profesional',   desc: 'PDA vault dengan otoritas program-derived — tanpa admin key, tanpa risiko kustodial.' },
      ],
    },
    steps: {
      kicker: 'CARA KERJANYA',
      title:  '3 langkah distribusi token otomatis',
      items: [
        { n: '01', title: 'Hubungkan wallet kamu',       desc: 'Hubungkan wallet Solana kamu ke dasbor TDP. Tidak perlu membuat akun.' },
        { n: '02', title: 'Konfigurasi stream kamu',     desc: 'Atur penerima, jumlah token, tanggal cliff, dan jadwal vesting dalam satu formulir.' },
        { n: '03', title: 'Pilih verifikasi kamu',       desc: 'Pilih antara klaim langsung yang sederhana untuk kemudahan maksimal, atau verifikasi gamified sebagai filter anti-bot.' },
      ],
    },
  },
} as const;

const howToPlay = {
  en: {
    badge:    'BLOCKBITE TDP',
    title:    'How the Token Distribution Protocol Works',
    subtitle: 'A step-by-step guide to vesting, claiming, and verification on Solana.',
    steps: [
      { title: 'Connect Your Wallet',       desc: 'Link your Solana wallet to sign transactions on devnet. Use Phantom, Backpack, or any Wallet Adapter-compatible wallet.' },
      { title: 'Create a Vesting Stream',   desc: 'Lock tokens into a PDA vault by setting a recipient, cliff date, end date, and vesting type (linear, milestone, hybrid).' },
      { title: 'Choose Verification',       desc: 'Choose between a simple direct claim for maximum ease, or gamified verification to act as an anti-bots filter.' },
      { title: 'Claim Vested Tokens',       desc: 'Once past the cliff, the beneficiary can withdraw unlocked tokens any time from the Claim Portal.' },
      { title: 'Manage & Audit',            desc: 'Cancel streams, verify milestones, and view the full immutable audit trail on-chain.' },
    ],
    faqTitle: 'Frequently Asked Questions',
  },
  id: {
    badge:    'BLOCKBITE TDP',
    title:    'Cara Kerja Token Distribution Protocol',
    subtitle: 'Panduan langkah demi langkah untuk vesting, klaim, dan verifikasi di Solana.',
    steps: [
      { title: 'Hubungkan Wallet Kamu',         desc: 'Hubungkan wallet Solana kamu untuk menandatangani transaksi di devnet. Gunakan Phantom, Backpack, atau wallet kompatibel Wallet Adapter.' },
      { title: 'Buat Stream Vesting',           desc: 'Kunci token ke PDA vault dengan mengatur penerima, tanggal cliff, tanggal berakhir, dan tipe vesting (linear, milestone, hybrid).' },
      { title: 'Pilih Verifikasi',              desc: 'Pilih antara klaim langsung yang sederhana untuk kemudahan maksimal, atau verifikasi gamified sebagai filter anti-bot.' },
      { title: 'Klaim Token Vesting',           desc: 'Setelah melewati cliff, penerima dapat menarik token yang terbuka kapan saja dari Portal Klaim.' },
      { title: 'Kelola & Audit',                desc: 'Batalkan stream, verifikasi milestone, dan lihat jejak audit penuh yang tidak berubah on-chain.' },
    ],
    faqTitle: 'Pertanyaan yang Sering Diajukan',
  },
} as const;

// ─── Master export ────────────────────────────────────────────────────────────
type PageI18N<E, I> = { en: E; id: I };

export const I18N: {
  common:       PageI18N<typeof common.en,       typeof common.id>;
  streams:      PageI18N<typeof streams.en,      typeof streams.id>;
  claim:        PageI18N<typeof claim.en,        typeof claim.id>;
  milestones:   PageI18N<typeof milestones.en,   typeof milestones.id>;
  campaigns:    PageI18N<typeof campaigns.en,    typeof campaigns.id>;
  analytics:    PageI18N<typeof analytics.en,    typeof analytics.id>;
  audit:        PageI18N<typeof audit.en,        typeof audit.id>;
  calculator:   PageI18N<typeof calculator.en,   typeof calculator.id>;
  protocol:     PageI18N<typeof protocol.en,     typeof protocol.id>;
  streamsNew:   PageI18N<typeof streamsNew.en,   typeof streamsNew.id>;
  streamsDetail:PageI18N<typeof streamsDetail.en,typeof streamsDetail.id>;
  waitlist:     PageI18N<typeof waitlist.en,     typeof waitlist.id>;
  howToPlay:    PageI18N<typeof howToPlay.en,    typeof howToPlay.id>;
} = {
  common, streams, claim, milestones, campaigns,
  analytics, audit, calculator, protocol,
  streamsNew, streamsDetail, waitlist, howToPlay,
};

/** Convenience: get the right lang slice for a page namespace */
export function tx<K extends keyof typeof I18N>(page: K, lang: Lang) {
  return I18N[page][lang] as (typeof I18N)[K]['en'] & (typeof I18N)[K]['id'];
}
