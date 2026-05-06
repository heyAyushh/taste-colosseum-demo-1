use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, program_pack::Pack};

declare_id!("9KrqHV2a2YqUaDkEP3jJ6zYxoyMNQgPaeskQxuWRuNy");

const TASTE_PROTOCOL_PROGRAM_ID: Pubkey = pubkey!("FdxAfXgWTddXjDFL3TSt7wYEv19AM5h6e4ntHBjmzKbt");

const ACCOUNT_VERSION: u8 = 1;
const DISCRIMINATOR_BYTES: usize = 8;
const PUBKEY_BYTES: usize = 32;
const U64_BYTES: usize = 8;
const U8_BYTES: usize = 1;
const BOOL_BYTES: usize = 1;
const RESERVED_BYTES: usize = 64;

const DEMO_SCAN_POOL_SEED: &[u8] = b"demo-scan-pool";
const DEMO_SCAN_CLAIM_RECEIPT_SEED: &[u8] = b"demo-scan-claim";
const PROTOCOL_CONFIG_DISCRIMINATOR: [u8; DISCRIMINATOR_BYTES] = [207, 91, 250, 28, 152, 179, 215, 209];
const BRAND_DISCRIMINATOR: [u8; DISCRIMINATOR_BYTES] = [167, 131, 217, 205, 236, 62, 187, 225];
const PRODUCT_DISCRIMINATOR: [u8; DISCRIMINATOR_BYTES] = [102, 76, 55, 251, 38, 73, 224, 229];
const LOT_DISCRIMINATOR: [u8; DISCRIMINATOR_BYTES] = [2, 198, 93, 153, 205, 31, 101, 252];

#[program]
pub mod taste_scan_claim {
    use super::*;

    pub fn open_demo_scan_pool(
        ctx: Context<OpenDemoScanPool>,
        reward_amount: u64,
        max_claims: u64,
    ) -> Result<()> {
        require!(reward_amount > 0, ScanClaimError::InvalidDemoScanPool);
        require!(max_claims > 0, ScanClaimError::InvalidDemoScanPool);

        let protocol_config = load_protocol_config(&ctx.accounts.protocol_config)?;
        require!(!protocol_config.paused, ScanClaimError::ProtocolPaused);

        let brand = load_brand(&ctx.accounts.brand)?;
        let product = load_product(&ctx.accounts.product)?;
        let lot = load_lot(&ctx.accounts.lot)?;

        require!(brand.active, ScanClaimError::InvalidBrand);
        require!(product.active, ScanClaimError::ProductInactive);
        require!(lot.active, ScanClaimError::InvalidLot);
        require!(!lot.recalled, ScanClaimError::InvalidLot);
        require_keys_eq!(brand.authority, ctx.accounts.brand_authority.key(), ScanClaimError::Unauthorized);
        require_keys_eq!(product.brand, ctx.accounts.brand.key(), ScanClaimError::InvalidProduct);
        require_keys_eq!(lot.product, ctx.accounts.product.key(), ScanClaimError::InvalidLot);
        require!(
            product.brand_id == brand.brand_id
                && lot.brand_id == brand.brand_id
                && lot.product_id == product.product_id,
            ScanClaimError::InvalidDemoScanPool
        );

        validate_owned_token_account(
            &ctx.accounts.reward_vault,
            ctx.accounts.demo_scan_pool.key(),
            protocol_config.reward_mint,
        )?;

        let pool = &mut ctx.accounts.demo_scan_pool;
        pool.version = ACCOUNT_VERSION;
        pool.protocol_config = ctx.accounts.protocol_config.key();
        pool.brand = ctx.accounts.brand.key();
        pool.product = ctx.accounts.product.key();
        pool.lot = ctx.accounts.lot.key();
        pool.reward_mint = protocol_config.reward_mint;
        pool.reward_vault = ctx.accounts.reward_vault.key();
        pool.authority = ctx.accounts.brand_authority.key();
        pool.brand_id = brand.brand_id;
        pool.product_id = product.product_id;
        pool.lot_id = lot.lot_id;
        pool.reward_amount = reward_amount;
        pool.max_claims = max_claims;
        pool.claims_paid = 0;
        pool.total_distributed = 0;
        pool.active = true;
        pool.bump = ctx.bumps.demo_scan_pool;
        pool._reserved = [0; RESERVED_BYTES];

        emit!(DemoScanPoolOpened {
            brand: pool.brand,
            product: pool.product,
            lot: pool.lot,
            reward_amount,
            max_claims,
        });

        Ok(())
    }

    pub fn claim_demo_scan_reward(ctx: Context<ClaimDemoScanReward>) -> Result<()> {
        let protocol_config = load_protocol_config(&ctx.accounts.protocol_config)?;
        require!(!protocol_config.paused, ScanClaimError::ProtocolPaused);

        let brand = load_brand(&ctx.accounts.brand)?;
        let product = load_product(&ctx.accounts.product)?;
        let lot = load_lot(&ctx.accounts.lot)?;

        require!(brand.active, ScanClaimError::InvalidBrand);
        require!(product.active, ScanClaimError::ProductInactive);
        require!(lot.active, ScanClaimError::InvalidLot);
        require!(!lot.recalled, ScanClaimError::InvalidLot);
        require_keys_eq!(product.brand, ctx.accounts.brand.key(), ScanClaimError::InvalidProduct);
        require_keys_eq!(lot.product, ctx.accounts.product.key(), ScanClaimError::InvalidLot);

        let pool = &mut ctx.accounts.demo_scan_pool;
        require!(pool.active, ScanClaimError::DemoScanPoolInactive);
        require_keys_eq!(pool.protocol_config, ctx.accounts.protocol_config.key(), ScanClaimError::InvalidDemoScanPool);
        require_keys_eq!(pool.brand, ctx.accounts.brand.key(), ScanClaimError::InvalidDemoScanPool);
        require_keys_eq!(pool.product, ctx.accounts.product.key(), ScanClaimError::InvalidDemoScanPool);
        require_keys_eq!(pool.lot, ctx.accounts.lot.key(), ScanClaimError::InvalidDemoScanPool);
        require_keys_eq!(pool.reward_mint, protocol_config.reward_mint, ScanClaimError::InvalidDemoScanPool);
        require!(
            pool.brand_id == brand.brand_id
                && pool.product_id == product.product_id
                && pool.lot_id == lot.lot_id
                && lot.brand_id == brand.brand_id
                && lot.product_id == product.product_id,
            ScanClaimError::InvalidDemoScanPool
        );
        require!(pool.claims_paid < pool.max_claims, ScanClaimError::DemoScanPoolDepleted);

        validate_owned_token_account(
            &ctx.accounts.reward_vault,
            pool.key(),
            protocol_config.reward_mint,
        )?;
        validate_token_account_owner_and_mint(
            &ctx.accounts.scanner_token_account,
            ctx.accounts.scanner.key(),
            protocol_config.reward_mint,
        )?;

        let product_key = ctx.accounts.product.key();
        let lot_key = ctx.accounts.lot.key();
        let pool_bump = [pool.bump];
        let signer_seeds: &[&[&[u8]]] =
            &[&[DEMO_SCAN_POOL_SEED, product_key.as_ref(), lot_key.as_ref(), &pool_bump]];
        spl_token_transfer(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.reward_vault.to_account_info(),
            ctx.accounts.scanner_token_account.to_account_info(),
            pool.to_account_info(),
            pool.reward_amount,
            signer_seeds,
        )?;

        pool.claims_paid = pool
            .claims_paid
            .checked_add(1)
            .ok_or(ScanClaimError::MathOverflow)?;
        pool.total_distributed = pool
            .total_distributed
            .checked_add(pool.reward_amount)
            .ok_or(ScanClaimError::MathOverflow)?;
        if pool.claims_paid >= pool.max_claims {
            pool.active = false;
        }

        let claim_receipt = &mut ctx.accounts.demo_scan_claim_receipt;
        claim_receipt.version = ACCOUNT_VERSION;
        claim_receipt.pool = pool.key();
        claim_receipt.scanner = ctx.accounts.scanner.key();
        claim_receipt.product = ctx.accounts.product.key();
        claim_receipt.lot = ctx.accounts.lot.key();
        claim_receipt.reward_amount = pool.reward_amount;
        claim_receipt.claimed_slot = Clock::get()?.slot;
        claim_receipt.bump = ctx.bumps.demo_scan_claim_receipt;
        claim_receipt._reserved = [0; RESERVED_BYTES];

        emit!(DemoScanRewardClaimed {
            pool: pool.key(),
            scanner: ctx.accounts.scanner.key(),
            reward_amount: pool.reward_amount,
            claims_paid: pool.claims_paid,
            max_claims: pool.max_claims,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct OpenDemoScanPool<'info> {
    #[account(mut)]
    pub brand_authority: Signer<'info>,
    /// CHECK: validated against the taste protocol owner and discriminator.
    pub protocol_config: UncheckedAccount<'info>,
    /// CHECK: validated against the taste protocol owner and discriminator.
    pub brand: UncheckedAccount<'info>,
    /// CHECK: validated against the taste protocol owner and discriminator.
    pub product: UncheckedAccount<'info>,
    /// CHECK: validated against the taste protocol owner and discriminator.
    pub lot: UncheckedAccount<'info>,
    /// CHECK: validated as an SPL token account owned by the pool PDA.
    #[account(mut)]
    pub reward_vault: UncheckedAccount<'info>,
    #[account(
        init,
        payer = brand_authority,
        space = DemoScanPool::SPACE,
        seeds = [DEMO_SCAN_POOL_SEED, product.key().as_ref(), lot.key().as_ref()],
        bump
    )]
    pub demo_scan_pool: Account<'info, DemoScanPool>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimDemoScanReward<'info> {
    #[account(mut)]
    pub scanner: Signer<'info>,
    /// CHECK: validated against the taste protocol owner and discriminator.
    pub protocol_config: UncheckedAccount<'info>,
    /// CHECK: validated against the taste protocol owner and discriminator.
    pub brand: UncheckedAccount<'info>,
    /// CHECK: validated against the taste protocol owner and discriminator.
    pub product: UncheckedAccount<'info>,
    /// CHECK: validated against the taste protocol owner and discriminator.
    pub lot: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [DEMO_SCAN_POOL_SEED, product.key().as_ref(), lot.key().as_ref()],
        bump = demo_scan_pool.bump
    )]
    pub demo_scan_pool: Account<'info, DemoScanPool>,
    #[account(
        init,
        payer = scanner,
        space = DemoScanClaimReceipt::SPACE,
        seeds = [DEMO_SCAN_CLAIM_RECEIPT_SEED, demo_scan_pool.key().as_ref(), scanner.key().as_ref()],
        bump
    )]
    pub demo_scan_claim_receipt: Account<'info, DemoScanClaimReceipt>,
    /// CHECK: validated as an SPL token account owned by the pool PDA.
    #[account(mut)]
    pub reward_vault: UncheckedAccount<'info>,
    /// CHECK: validated as an SPL token account owned by the scanner for the reward mint.
    #[account(mut)]
    pub scanner_token_account: UncheckedAccount<'info>,
    /// CHECK: address must match the SPL Token program.
    #[account(address = spl_token::id())]
    pub token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct DemoScanPool {
    pub version: u8,
    pub protocol_config: Pubkey,
    pub brand: Pubkey,
    pub product: Pubkey,
    pub lot: Pubkey,
    pub reward_mint: Pubkey,
    pub reward_vault: Pubkey,
    pub authority: Pubkey,
    pub brand_id: u64,
    pub product_id: u64,
    pub lot_id: u64,
    pub reward_amount: u64,
    pub max_claims: u64,
    pub claims_paid: u64,
    pub total_distributed: u64,
    pub active: bool,
    pub bump: u8,
    pub _reserved: [u8; RESERVED_BYTES],
}

impl DemoScanPool {
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + U8_BYTES
        + (PUBKEY_BYTES * 7)
        + (U64_BYTES * 7)
        + BOOL_BYTES
        + U8_BYTES
        + RESERVED_BYTES;
}

#[account]
pub struct DemoScanClaimReceipt {
    pub version: u8,
    pub pool: Pubkey,
    pub scanner: Pubkey,
    pub product: Pubkey,
    pub lot: Pubkey,
    pub reward_amount: u64,
    pub claimed_slot: u64,
    pub bump: u8,
    pub _reserved: [u8; RESERVED_BYTES],
}

impl DemoScanClaimReceipt {
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + U8_BYTES
        + (PUBKEY_BYTES * 4)
        + U64_BYTES
        + U64_BYTES
        + U8_BYTES
        + RESERVED_BYTES;
}

#[event]
pub struct DemoScanPoolOpened {
    pub brand: Pubkey,
    pub product: Pubkey,
    pub lot: Pubkey,
    pub reward_amount: u64,
    pub max_claims: u64,
}

#[event]
pub struct DemoScanRewardClaimed {
    pub pool: Pubkey,
    pub scanner: Pubkey,
    pub reward_amount: u64,
    pub claims_paid: u64,
    pub max_claims: u64,
}

#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
struct ExternalProtocolConfig {
    pub version: u8,
    pub admin: Pubkey,
    pub resolver: Pubkey,
    pub reward_mint: Pubkey,
    pub paused: bool,
    pub base_reward: u64,
    pub limited_reward: u64,
    pub wallet_epoch_reward_cap: u64,
    pub product_epoch_reward_cap: u64,
    pub claim_epoch_reward_cap: u64,
    pub bump: u8,
    pub _reserved: [u8; RESERVED_BYTES],
}

#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
struct ExternalBrand {
    pub version: u8,
    pub brand_id: u64,
    pub brand_hash: u64,
    pub authority: Pubkey,
    pub active: bool,
    pub bump: u8,
    pub _reserved: [u8; RESERVED_BYTES],
}

#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
struct ExternalProduct {
    pub version: u8,
    pub brand: Pubkey,
    pub brand_id: u64,
    pub product_id: u64,
    pub product_hash: u64,
    pub maker_id: u64,
    pub active: bool,
    pub bump: u8,
    pub _reserved: [u8; RESERVED_BYTES],
}

#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
struct ExternalLot {
    pub version: u8,
    pub product: Pubkey,
    pub manufacturer: Pubkey,
    pub product_id: u64,
    pub brand_id: u64,
    pub maker_id: u64,
    pub lot_id: u64,
    pub lot_hash: u64,
    pub expiry_slot: u64,
    pub recalled: bool,
    pub active: bool,
    pub bump: u8,
    pub _reserved: [u8; RESERVED_BYTES],
}

#[error_code]
pub enum ScanClaimError {
    #[msg("The source account owner is invalid.")]
    InvalidSourceAccountOwner,
    #[msg("The source account data is invalid.")]
    InvalidSourceAccountData,
    #[msg("The protocol is paused.")]
    ProtocolPaused,
    #[msg("The demo scan pool is invalid.")]
    InvalidDemoScanPool,
    #[msg("The demo scan pool is inactive.")]
    DemoScanPoolInactive,
    #[msg("The demo scan pool is depleted.")]
    DemoScanPoolDepleted,
    #[msg("The brand is invalid.")]
    InvalidBrand,
    #[msg("The product is invalid.")]
    InvalidProduct,
    #[msg("The product is inactive.")]
    ProductInactive,
    #[msg("The lot is invalid.")]
    InvalidLot,
    #[msg("The signer is not authorized for this action.")]
    Unauthorized,
    #[msg("The token account is invalid.")]
    InvalidTokenAccount,
    #[msg("The math operation overflowed.")]
    MathOverflow,
}

fn load_protocol_config(account: &UncheckedAccount<'_>) -> Result<ExternalProtocolConfig> {
    deserialize_external_account(account, "ProtocolConfig")
}

fn load_brand(account: &UncheckedAccount<'_>) -> Result<ExternalBrand> {
    deserialize_external_account(account, "Brand")
}

fn load_product(account: &UncheckedAccount<'_>) -> Result<ExternalProduct> {
    deserialize_external_account(account, "Product")
}

fn load_lot(account: &UncheckedAccount<'_>) -> Result<ExternalLot> {
    deserialize_external_account(account, "Lot")
}

fn deserialize_external_account<T: AnchorDeserialize>(
    account: &UncheckedAccount<'_>,
    account_name: &str,
) -> Result<T> {
    require_keys_eq!(
        *account.owner,
        TASTE_PROTOCOL_PROGRAM_ID,
        ScanClaimError::InvalidSourceAccountOwner
    );
    let data = account.try_borrow_data()?;
    require!(
        data.len() > DISCRIMINATOR_BYTES,
        ScanClaimError::InvalidSourceAccountData
    );
    require!(
        data[..DISCRIMINATOR_BYTES] == expected_external_discriminator(account_name),
        ScanClaimError::InvalidSourceAccountData
    );
    let mut slice: &[u8] = &data[DISCRIMINATOR_BYTES..];
    T::deserialize(&mut slice).map_err(|_| error!(ScanClaimError::InvalidSourceAccountData))
}

fn expected_external_discriminator(account_name: &str) -> [u8; DISCRIMINATOR_BYTES] {
    match account_name {
        "ProtocolConfig" => PROTOCOL_CONFIG_DISCRIMINATOR,
        "Brand" => BRAND_DISCRIMINATOR,
        "Product" => PRODUCT_DISCRIMINATOR,
        "Lot" => LOT_DISCRIMINATOR,
        _ => [0; DISCRIMINATOR_BYTES],
    }
}

fn validate_owned_token_account(
    token_account: &UncheckedAccount<'_>,
    expected_owner: Pubkey,
    expected_mint: Pubkey,
) -> Result<()> {
    let parsed = spl_token::state::Account::unpack(&token_account.try_borrow_data()?)
        .map_err(|_| error!(ScanClaimError::InvalidTokenAccount))?;
    require_keys_eq!(parsed.owner, expected_owner, ScanClaimError::InvalidTokenAccount);
    require_keys_eq!(parsed.mint, expected_mint, ScanClaimError::InvalidTokenAccount);
    Ok(())
}

fn validate_token_account_owner_and_mint(
    token_account: &UncheckedAccount<'_>,
    expected_owner: Pubkey,
    expected_mint: Pubkey,
) -> Result<()> {
    validate_owned_token_account(token_account, expected_owner, expected_mint)
}

fn spl_token_transfer<'info>(
    token_program: AccountInfo<'info>,
    source: AccountInfo<'info>,
    destination: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let transfer_ix = spl_token::instruction::transfer(
        &spl_token::id(),
        &source.key(),
        &destination.key(),
        &authority.key(),
        &[],
        amount,
    )?;
    invoke_signed(
        &transfer_ix,
        &[source, destination, authority, token_program],
        signer_seeds,
    )?;
    Ok(())
}
