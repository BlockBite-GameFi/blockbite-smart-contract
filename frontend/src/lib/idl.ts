// Anchor 0.32.x IDL — matches blockbite/programs/blockbite/src/**
// Discriminators computed: sha256("global:<name>")[0..8] for instructions
//                          sha256("account:StreamAccount")[0..8] for account

export const IDL = {
  address: "9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX",
  metadata: { name: "blockbite", version: "0.1.0", spec: "0.1.0" },

  instructions: [
    {
      name: "createStream",
      discriminator: [71, 188, 111, 127, 108, 40, 229, 158],
      accounts: [
        { name: "creator",            writable: true,  signer: true  },
        { name: "recipient"                                            },
        { name: "mint"                                                 },
        { name: "creatorTokenAccount", writable: true                 },
        { name: "escrowTokenAccount",  writable: true,  pda: true    },
        { name: "stream",              writable: true,  pda: true    },
        { name: "tokenProgram"                                         },
        { name: "systemProgram"                                        },
      ],
      args: [
        { name: "totalAmount",      type: "u64"  },
        { name: "startTime",        type: "i64"  },
        { name: "endTime",          type: "i64"  },
        { name: "cliffTime",        type: "i64"  },
        { name: "seed",             type: "u64"  },
        { name: "milestoneEnabled", type: "bool" },
      ],
    },
    {
      name: "withdraw",
      discriminator: [183, 18, 70, 156, 148, 109, 161, 34],
      accounts: [
        { name: "recipient",             writable: true, signer: true },
        { name: "stream",                writable: true, pda: true    },
        { name: "mint"                                                  },
        { name: "escrowTokenAccount",    writable: true               },
        { name: "recipientTokenAccount", writable: true               },
        { name: "tokenProgram"                                          },
      ],
      args: [],
    },
    {
      name: "cancel",
      discriminator: [232, 219, 223, 41, 219, 236, 220, 190],
      accounts: [
        { name: "creator",               writable: true, signer: true },
        { name: "stream",                writable: true, pda: true    },
        { name: "mint"                                                  },
        { name: "escrowTokenAccount",    writable: true               },
        { name: "creatorTokenAccount",   writable: true               },
        { name: "recipientTokenAccount", writable: true               },
        { name: "tokenProgram"                                          },
      ],
      args: [],
    },
    {
      name: "setMilestone",
      discriminator: [174, 213, 91, 82, 156, 42, 105, 3],
      accounts: [
        { name: "creator", writable: false, signer: true },
        { name: "stream",  writable: true,  pda: true    },
      ],
      args: [],
    },
  ],

  accounts: [
    {
      name: "StreamAccount",
      discriminator: [243, 60, 164, 106, 199, 192, 110, 53],
    },
  ],

  types: [
    {
      name: "StreamAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "creator",             type: "pubkey" },
          { name: "recipient",           type: "pubkey" },
          { name: "mint",                type: "pubkey" },
          { name: "escrowTokenAccount",  type: "pubkey" },
          { name: "totalAmount",         type: "u64"    },
          { name: "amountWithdrawn",     type: "u64"    },
          { name: "startTime",           type: "i64"    },
          { name: "endTime",             type: "i64"    },
          { name: "cliffTime",           type: "i64"    },
          { name: "isCancelled",        type: "bool" },
          { name: "bump",               type: "u8"   },
          { name: "seed",               type: "u64"  },
          { name: "milestoneReached",   type: "bool" },
          { name: "milestoneEnabled",   type: "bool" },
        ],
      },
    },
  ],

  errors: [
    { code: 6000, name: "Unauthorized",          msg: "Signer is not authorised to perform this action" },
    { code: 6001, name: "InsufficientUnlockedTokens", msg: "Claimable amount is zero or exceeds unlocked tokens" },
    { code: 6002, name: "StreamCancelled",       msg: "Stream has been cancelled" },
    { code: 6003, name: "StreamAlreadyCancelled",msg: "Stream is already cancelled" },
    { code: 6004, name: "StreamNotStarted",      msg: "Stream has not started yet" },
    { code: 6005, name: "InvalidTimestamp",      msg: "Invalid timestamps" },
    { code: 6006, name: "InvalidAmount",         msg: "Amount must be greater than zero" },
    { code: 6007, name: "InvalidRecipient",      msg: "Creator and recipient cannot be the same account" },
    { code: 6008, name: "AlreadyCancelled",      msg: "Stream is already cancelled" },
    { code: 6009, name: "FullyVested",           msg: "Stream is fully vested and cannot be cancelled" },
    { code: 6010, name: "NothingToWithdraw",     msg: "No tokens available to withdraw" },
    { code: 6011, name: "MilestoneAlreadyReached", msg: "Milestone has already been reached" },
    { code: 6012, name: "CliffNotReached",       msg: "Cliff period has not been reached yet" },
    { code: 6013, name: "BotDetected",           msg: "Suspicious activity detected: too many rapid actions" },
    { code: 6014, name: "StreamExpired",         msg: "Stream has expired and is no longer active" },
    { code: 6015, name: "ClaimTooSmall",         msg: "Claim amount is below minimum threshold" },
    { code: 6016, name: "StreamNotCloseable",    msg: "Stream must be cancelled or fully withdrawn before closing" },
  ],
} as const;

export type BlockbiteIDL = typeof IDL;
