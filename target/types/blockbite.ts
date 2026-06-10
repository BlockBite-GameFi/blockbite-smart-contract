/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/blockbite.json`.
 */
export type Blockbite = {
  "address": "9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX",
  "metadata": {
    "name": "blockbite",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "cancel",
      "discriminator": [
        232,
        219,
        223,
        41,
        219,
        236,
        220,
        190
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "stream",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  114,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "stream.creator",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.recipient",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.seed",
                "account": "streamAccount"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "escrowTokenAccount",
          "writable": true
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "recipientTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimMilestone",
      "discriminator": [
        211,
        134,
        152,
        37,
        3,
        82,
        214,
        189
      ],
      "accounts": [
        {
          "name": "recipient",
          "writable": true,
          "signer": true
        },
        {
          "name": "milestone",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  108,
                  101,
                  115,
                  116,
                  111,
                  110,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "milestone.campaign",
                "account": "milestoneAccount"
              },
              {
                "kind": "arg",
                "path": "milestoneSeed"
              }
            ]
          }
        },
        {
          "name": "campaign",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "campaign.founder",
                "account": "campaignAccount"
              },
              {
                "kind": "arg",
                "path": "campaignSeed"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "campaignEscrow",
          "docs": [
            "Campaign escrow — authority is the campaign PDA."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              }
            ]
          }
        },
        {
          "name": "recipientTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "milestoneSeed",
          "type": "u64"
        },
        {
          "name": "campaignSeed",
          "type": "u64"
        }
      ]
    },
    {
      "name": "closeStream",
      "discriminator": [
        255,
        241,
        196,
        212,
        95,
        93,
        160,
        89
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "stream",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  114,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "account",
                "path": "recipient"
              },
              {
                "kind": "account",
                "path": "stream.seed",
                "account": "streamAccount"
              }
            ]
          }
        },
        {
          "name": "recipient",
          "docs": [
            "The recipient's stream vesting context."
          ]
        },
        {
          "name": "mint"
        },
        {
          "name": "escrowTokenAccount",
          "docs": [
            "Escrow token account — must be empty before closing."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "stream"
              }
            ]
          }
        },
        {
          "name": "creatorTokenAccount",
          "docs": [
            "Creator's token account — receives any remaining escrow balance."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "createCampaign",
      "discriminator": [
        111,
        131,
        187,
        98,
        160,
        193,
        114,
        244
      ],
      "accounts": [
        {
          "name": "founder",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "founderTokenAccount",
          "writable": true
        },
        {
          "name": "campaignEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              }
            ]
          }
        },
        {
          "name": "campaign",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "founder"
              },
              {
                "kind": "arg",
                "path": "seed"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "titleHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "totalBudget",
          "type": "u64"
        },
        {
          "name": "seed",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createMilestone",
      "discriminator": [
        239,
        58,
        201,
        28,
        40,
        186,
        173,
        48
      ],
      "accounts": [
        {
          "name": "founder",
          "writable": true,
          "signer": true
        },
        {
          "name": "campaign",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "campaign.founder",
                "account": "campaignAccount"
              },
              {
                "kind": "arg",
                "path": "campaignSeed"
              }
            ]
          }
        },
        {
          "name": "milestone",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  108,
                  101,
                  115,
                  116,
                  111,
                  110,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              },
              {
                "kind": "arg",
                "path": "milestoneSeed"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "descriptionHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "campaignSeed",
          "type": "u64"
        },
        {
          "name": "milestoneSeed",
          "type": "u64"
        },
        {
          "name": "tokenAmount",
          "type": "u64"
        },
        {
          "name": "gameAuthority",
          "type": "pubkey"
        },
        {
          "name": "recipient",
          "type": "pubkey"
        },
        {
          "name": "targetLevel",
          "type": "u8"
        },
        {
          "name": "difficulty",
          "type": "u8"
        }
      ]
    },
    {
      "name": "createStream",
      "discriminator": [
        71,
        188,
        111,
        127,
        108,
        40,
        229,
        158
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "recipient"
        },
        {
          "name": "mint"
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "escrowTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "stream"
              }
            ]
          }
        },
        {
          "name": "stream",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  114,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "account",
                "path": "recipient"
              },
              {
                "kind": "arg",
                "path": "seed"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "totalAmount",
          "type": "u64"
        },
        {
          "name": "startTime",
          "type": "i64"
        },
        {
          "name": "endTime",
          "type": "i64"
        },
        {
          "name": "cliffTime",
          "type": "i64"
        },
        {
          "name": "seed",
          "type": "u64"
        },
        {
          "name": "milestoneEnabled",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setMilestone",
      "discriminator": [
        174,
        213,
        91,
        82,
        156,
        42,
        105,
        3
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "stream",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  114,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "stream.creator",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.recipient",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.seed",
                "account": "streamAccount"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "verifyGame",
      "discriminator": [
        81,
        26,
        37,
        190,
        207,
        209,
        205,
        211
      ],
      "accounts": [
        {
          "name": "campaign",
          "docs": [
            "Not read or written by this instruction."
          ]
        },
        {
          "name": "milestone",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  108,
                  101,
                  115,
                  116,
                  111,
                  110,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              },
              {
                "kind": "arg",
                "path": "milestoneSeed"
              }
            ]
          }
        },
        {
          "name": "gameAuthority",
          "docs": [
            "The game server's signing key — must match milestone.game_authority."
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "milestoneSeed",
          "type": "u64"
        },
        {
          "name": "achievedLevel",
          "type": "u8"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "recipient",
          "writable": true,
          "signer": true
        },
        {
          "name": "stream",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  114,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "stream.creator",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.recipient",
                "account": "streamAccount"
              },
              {
                "kind": "account",
                "path": "stream.seed",
                "account": "streamAccount"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "escrowTokenAccount",
          "writable": true
        },
        {
          "name": "recipientTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "campaignAccount",
      "discriminator": [
        167,
        6,
        205,
        183,
        220,
        156,
        200,
        113
      ]
    },
    {
      "name": "milestoneAccount",
      "discriminator": [
        21,
        222,
        32,
        140,
        43,
        166,
        109,
        19
      ]
    },
    {
      "name": "streamAccount",
      "discriminator": [
        243,
        60,
        164,
        106,
        199,
        192,
        110,
        53
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Signer is not authorised to perform this action"
    },
    {
      "code": 6001,
      "name": "nothingToWithdraw",
      "msg": "No tokens available to withdraw"
    },
    {
      "code": 6002,
      "name": "streamCancelled",
      "msg": "Stream has been cancelled"
    },
    {
      "code": 6003,
      "name": "alreadyCancelled",
      "msg": "Stream is already cancelled"
    },
    {
      "code": 6004,
      "name": "streamNotStarted",
      "msg": "Stream has not started yet"
    },
    {
      "code": 6005,
      "name": "invalidTimestamp",
      "msg": "Invalid timestamps: end must be after start, cliff must be before end"
    },
    {
      "code": 6006,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6007,
      "name": "invalidRecipient",
      "msg": "Creator and recipient cannot be the same account"
    },
    {
      "code": 6008,
      "name": "fullyVested",
      "msg": "Stream is fully vested and cannot be cancelled"
    },
    {
      "code": 6009,
      "name": "milestoneAlreadyReached",
      "msg": "Milestone has already been reached"
    },
    {
      "code": 6010,
      "name": "campaignNotFound",
      "msg": "Campaign not found"
    },
    {
      "code": 6011,
      "name": "milestoneNotFound",
      "msg": "Milestone not found"
    },
    {
      "code": 6012,
      "name": "milestoneAlreadyVerified",
      "msg": "Milestone has already been verified"
    },
    {
      "code": 6013,
      "name": "insufficientBudget",
      "msg": "Campaign budget is insufficient for this milestone"
    },
    {
      "code": 6014,
      "name": "milestoneNotVerified",
      "msg": "Milestone has not been verified yet"
    },
    {
      "code": 6015,
      "name": "streamNotSettled",
      "msg": "Stream must be fully withdrawn or cancelled before closing"
    },
    {
      "code": 6016,
      "name": "invalidGameAuthority",
      "msg": "Provided game authority does not match the milestone's declared game authority"
    },
    {
      "code": 6017,
      "name": "alreadyClaimed",
      "msg": "Milestone reward has already been claimed"
    },
    {
      "code": 6018,
      "name": "invalidLevel",
      "msg": "Target level must be between 1 and 30"
    },
    {
      "code": 6019,
      "name": "levelNotReached",
      "msg": "Achieved level does not meet the target level requirement"
    },
    {
      "code": 6020,
      "name": "invalidDifficulty",
      "msg": "Difficulty must be 1 (easy), 2 (medium), or 3 (hard)"
    }
  ],
  "types": [
    {
      "name": "campaignAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "founder",
            "type": "pubkey"
          },
          {
            "name": "titleHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "totalBudget",
            "type": "u64"
          },
          {
            "name": "allocatedAmount",
            "type": "u64"
          },
          {
            "name": "milestoneCount",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "milestoneAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "descriptionHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "gameAuthority",
            "type": "pubkey"
          },
          {
            "name": "tokenAmount",
            "type": "u64"
          },
          {
            "name": "targetLevel",
            "type": "u8"
          },
          {
            "name": "achievedLevel",
            "type": "u8"
          },
          {
            "name": "difficulty",
            "type": "u8"
          },
          {
            "name": "isVerified",
            "type": "bool"
          },
          {
            "name": "isClaimed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "streamAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "escrowTokenAccount",
            "type": "pubkey"
          },
          {
            "name": "totalAmount",
            "type": "u64"
          },
          {
            "name": "amountWithdrawn",
            "type": "u64"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          },
          {
            "name": "cliffTime",
            "type": "i64"
          },
          {
            "name": "isCancelled",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "seed",
            "type": "u64"
          },
          {
            "name": "milestoneReached",
            "docs": [
              "When `true`, tokens are gated behind a milestone condition.",
              "Set by `set_milestone`. Only the creator can call it."
            ],
            "type": "bool"
          },
          {
            "name": "milestoneEnabled",
            "docs": [
              "When `true`, milestone gate is active for this stream.",
              "Auto-set to `true` when `cliff_time > 0` on creation.",
              "When `false`, milestone gate is bypassed (pure linear)."
            ],
            "type": "bool"
          }
        ]
      }
    }
  ]
};
