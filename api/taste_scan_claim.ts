/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/taste_scan_claim.json`.
 */
export type TasteScanClaim = {
  "address": "9KrqHV2a2YqUaDkEP3jJ6zYxoyMNQgPaeskQxuWRuNy",
  "metadata": {
    "name": "tasteScanClaim",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Dedicated direct scan payout program for taste.fun demos"
  },
  "instructions": [
    {
      "name": "claimDemoScanReward",
      "discriminator": [
        29,
        125,
        69,
        12,
        135,
        36,
        73,
        232
      ],
      "accounts": [
        {
          "name": "scanner",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolConfig"
        },
        {
          "name": "brand"
        },
        {
          "name": "product"
        },
        {
          "name": "lot"
        },
        {
          "name": "demoScanPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  109,
                  111,
                  45,
                  115,
                  99,
                  97,
                  110,
                  45,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "product"
              },
              {
                "kind": "account",
                "path": "lot"
              }
            ]
          }
        },
        {
          "name": "demoScanClaimReceipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  109,
                  111,
                  45,
                  115,
                  99,
                  97,
                  110,
                  45,
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "demoScanPool"
              },
              {
                "kind": "account",
                "path": "scanner"
              }
            ]
          }
        },
        {
          "name": "rewardVault",
          "writable": true
        },
        {
          "name": "scannerTokenAccount",
          "writable": true
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
      "args": []
    },
    {
      "name": "openDemoScanPool",
      "discriminator": [
        71,
        49,
        249,
        20,
        145,
        41,
        102,
        229
      ],
      "accounts": [
        {
          "name": "brandAuthority",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolConfig"
        },
        {
          "name": "brand"
        },
        {
          "name": "product"
        },
        {
          "name": "lot"
        },
        {
          "name": "rewardVault",
          "writable": true
        },
        {
          "name": "demoScanPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  109,
                  111,
                  45,
                  115,
                  99,
                  97,
                  110,
                  45,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "product"
              },
              {
                "kind": "account",
                "path": "lot"
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
          "name": "rewardAmount",
          "type": "u64"
        },
        {
          "name": "maxClaims",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "demoScanClaimReceipt",
      "discriminator": [
        52,
        218,
        11,
        52,
        78,
        162,
        170,
        158
      ]
    },
    {
      "name": "demoScanPool",
      "discriminator": [
        0,
        164,
        182,
        237,
        92,
        56,
        72,
        254
      ]
    }
  ],
  "events": [
    {
      "name": "demoScanPoolOpened",
      "discriminator": [
        226,
        180,
        39,
        14,
        201,
        235,
        118,
        190
      ]
    },
    {
      "name": "demoScanRewardClaimed",
      "discriminator": [
        210,
        91,
        150,
        132,
        95,
        213,
        250,
        238
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidSourceAccountOwner",
      "msg": "The source account owner is invalid."
    },
    {
      "code": 6001,
      "name": "invalidSourceAccountData",
      "msg": "The source account data is invalid."
    },
    {
      "code": 6002,
      "name": "protocolPaused",
      "msg": "The protocol is paused."
    },
    {
      "code": 6003,
      "name": "invalidDemoScanPool",
      "msg": "The demo scan pool is invalid."
    },
    {
      "code": 6004,
      "name": "demoScanPoolInactive",
      "msg": "The demo scan pool is inactive."
    },
    {
      "code": 6005,
      "name": "demoScanPoolDepleted",
      "msg": "The demo scan pool is depleted."
    },
    {
      "code": 6006,
      "name": "invalidBrand",
      "msg": "The brand is invalid."
    },
    {
      "code": 6007,
      "name": "invalidProduct",
      "msg": "The product is invalid."
    },
    {
      "code": 6008,
      "name": "productInactive",
      "msg": "The product is inactive."
    },
    {
      "code": 6009,
      "name": "invalidLot",
      "msg": "The lot is invalid."
    },
    {
      "code": 6010,
      "name": "unauthorized",
      "msg": "The signer is not authorized for this action."
    },
    {
      "code": 6011,
      "name": "invalidTokenAccount",
      "msg": "The token account is invalid."
    },
    {
      "code": 6012,
      "name": "mathOverflow",
      "msg": "The math operation overflowed."
    }
  ],
  "types": [
    {
      "name": "demoScanClaimReceipt",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "scanner",
            "type": "pubkey"
          },
          {
            "name": "product",
            "type": "pubkey"
          },
          {
            "name": "lot",
            "type": "pubkey"
          },
          {
            "name": "rewardAmount",
            "type": "u64"
          },
          {
            "name": "claimedSlot",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "demoScanPool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "protocolConfig",
            "type": "pubkey"
          },
          {
            "name": "brand",
            "type": "pubkey"
          },
          {
            "name": "product",
            "type": "pubkey"
          },
          {
            "name": "lot",
            "type": "pubkey"
          },
          {
            "name": "rewardMint",
            "type": "pubkey"
          },
          {
            "name": "rewardVault",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "brandId",
            "type": "u64"
          },
          {
            "name": "productId",
            "type": "u64"
          },
          {
            "name": "lotId",
            "type": "u64"
          },
          {
            "name": "rewardAmount",
            "type": "u64"
          },
          {
            "name": "maxClaims",
            "type": "u64"
          },
          {
            "name": "claimsPaid",
            "type": "u64"
          },
          {
            "name": "totalDistributed",
            "type": "u64"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "demoScanPoolOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "brand",
            "type": "pubkey"
          },
          {
            "name": "product",
            "type": "pubkey"
          },
          {
            "name": "lot",
            "type": "pubkey"
          },
          {
            "name": "rewardAmount",
            "type": "u64"
          },
          {
            "name": "maxClaims",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "demoScanRewardClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "scanner",
            "type": "pubkey"
          },
          {
            "name": "rewardAmount",
            "type": "u64"
          },
          {
            "name": "claimsPaid",
            "type": "u64"
          },
          {
            "name": "maxClaims",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
