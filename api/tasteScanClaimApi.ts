import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "./taste_scan_claim.idl.json" with { type: "json" };
import type { TasteScanClaim } from "./taste_scan_claim.js";
import {
  deriveConfig,
  deriveDemoScanClaimReceipt,
  deriveDemoScanPool,
  SPL_TOKEN_PROGRAM_ID,
  TASTE_SCAN_CLAIM_PROGRAM_ID,
} from "./browserSdk.js";

export type TasteScanClaimProgram = Program<TasteScanClaim>;

export function createTasteScanClaimProgram(
  provider: anchor.Provider,
): TasteScanClaimProgram {
  return new Program(idl as TasteScanClaim, provider);
}

export class TasteScanClaimApi {
  readonly program: TasteScanClaimProgram;
  readonly programId: PublicKey;

  constructor(program: TasteScanClaimProgram, programId = TASTE_SCAN_CLAIM_PROGRAM_ID) {
    this.program = program;
    this.programId = programId;
  }

  static fromProvider(
    provider: anchor.Provider,
    programId = TASTE_SCAN_CLAIM_PROGRAM_ID,
  ): TasteScanClaimApi {
    return new TasteScanClaimApi(createTasteScanClaimProgram(provider), programId);
  }

  openDemoScanPool(params: {
    brandAuthority: PublicKey;
    brand: PublicKey;
    product: PublicKey;
    lot: PublicKey;
    rewardVault: PublicKey;
    rewardAmount: anchor.BN | number | string;
    maxClaims: anchor.BN | number | string;
    protocolConfig?: PublicKey;
  }) {
    return this.program.methods
      .openDemoScanPool(toBN(params.rewardAmount), toBN(params.maxClaims))
      .accountsStrict({
        brandAuthority: params.brandAuthority,
        protocolConfig: params.protocolConfig ?? deriveConfig(),
        brand: params.brand,
        product: params.product,
        lot: params.lot,
        rewardVault: params.rewardVault,
        demoScanPool: deriveDemoScanPool(params.product, params.lot, this.programId),
        systemProgram: SystemProgram.programId,
      });
  }

  claimDemoScanReward(params: {
    scanner: PublicKey;
    brand: PublicKey;
    product: PublicKey;
    lot: PublicKey;
    rewardVault: PublicKey;
    scannerTokenAccount: PublicKey;
    protocolConfig?: PublicKey;
  }) {
    const demoScanPool = deriveDemoScanPool(params.product, params.lot, this.programId);
    return this.program.methods.claimDemoScanReward().accountsStrict({
      scanner: params.scanner,
      protocolConfig: params.protocolConfig ?? deriveConfig(),
      brand: params.brand,
      product: params.product,
      lot: params.lot,
      demoScanPool,
      demoScanClaimReceipt: deriveDemoScanClaimReceipt(
        demoScanPool,
        params.scanner,
        this.programId,
      ),
      rewardVault: params.rewardVault,
      scannerTokenAccount: params.scannerTokenAccount,
      tokenProgram: SPL_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });
  }
}

function toBN(value: anchor.BN | number | string): anchor.BN {
  return value instanceof anchor.BN ? value : new anchor.BN(String(value), 10);
}
