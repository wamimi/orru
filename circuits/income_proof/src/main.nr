mod commitment;

use commitment::{commitment, to_limbs};

global PERIODS: u32 = 3;
global BAND_COUNT: u32 = 10;

/// Band bounds in base units of a six-decimal token, per pay cycle.
/// Mirrors shared/bands.ts and DemoCreditPool.
global BAND_LO: [u64; 10] = [
    0, 500_000_000, 1_000_000_000, 1_500_000_000, 2_500_000_000, 4_000_000_000, 6_000_000_000,
    10_000_000_000, 15_000_000_000, 25_000_000_000,
];
global BAND_HI: [u64; 10] = [
    500_000_000, 1_000_000_000, 1_500_000_000, 2_500_000_000, 4_000_000_000, 6_000_000_000,
    10_000_000_000, 15_000_000_000, 25_000_000_000, 10_000_000_000_000,
];

global ALICE: Field = 0xf6A48D18DA6072eaDdBF5D2BfB9FE9263dE0b66C;

/// Proves a recipient was paid across consecutive periods, every payment inside
/// one income band, without revealing any amount.
///
/// Public inputs, in verifier order:
///   recipient, band, then two 128-bit limbs per commitment, high first.
///
/// There is no prover-supplied secret. Every public value is a function of the
/// attested commitments, so one evidence set yields exactly one claim and the
/// consuming contract derives its replay key from these same inputs.
fn main(
    amounts: [u64; PERIODS],
    periods: [u64; PERIODS],
    salts: [[u8; 32]; PERIODS],
    recipient: pub Field,
    band: pub Field,
    commitments: pub [[Field; 2]; PERIODS],
) {
    assert_is_address(recipient);

    let (lo, hi) = band_bounds(band);

    for i in 0..PERIODS {
        // u64 witnesses widened only to hash. Field witnesses narrowed with
        // `as u64` would let a value above 2^64 be committed at full width
        // while the band check saw the truncation.
        let c = commitment(recipient, amounts[i] as Field, periods[i] as Field, salts[i]);
        let limbs = to_limbs(c);

        assert(limbs[0] == commitments[i][0]);
        assert(limbs[1] == commitments[i][1]);

        assert(amounts[i] >= lo);
        assert(amounts[i] < hi);
    }

    for i in 1..PERIODS {
        assert(periods[i] == periods[i - 1] + 1);
    }
}

/// The public ABI treats this word as an address, so the circuit must too.
fn assert_is_address(value: Field) {
    let b: [u8; 32] = value.to_be_bytes();
    for i in 0..12 {
        assert(b[i] == 0);
    }
}

/// Selects bounds without indexing by a witness value.
fn band_bounds(band: Field) -> (u64, u64) {
    let mut lo: u64 = 0;
    let mut hi: u64 = 0;
    let mut found = false;

    for i in 0..BAND_COUNT {
        if band == i as Field {
            lo = BAND_LO[i];
            hi = BAND_HI[i];
            found = true;
        }
    }

    assert(found);
    (lo, hi)
}

fn limbs_for(
    recipient: Field,
    amounts: [u64; PERIODS],
    periods: [u64; PERIODS],
    salts: [[u8; 32]; PERIODS],
) -> [[Field; 2]; PERIODS] {
    let mut cs: [[Field; 2]; PERIODS] = [[0, 0]; PERIODS];
    for i in 0..PERIODS {
        cs[i] = to_limbs(commitment(recipient, amounts[i] as Field, periods[i] as Field, salts[i]));
    }
    cs
}

#[test]
fn test_accepts_a_valid_claim() {
    let salts = [[0; 32]; 3];
    let amounts = [2_500_000_000, 2_600_000_000, 2_700_000_000];
    let periods = [7, 8, 9];
    main(amounts, periods, salts, ALICE, 4, limbs_for(ALICE, amounts, periods, salts));
}

#[test(should_fail)]
fn test_rejects_amount_outside_the_band() {
    let salts = [[0; 32]; 3];
    let amounts = [2_500_000_000, 4_100_000_000, 2_700_000_000];
    let periods = [7, 8, 9];
    main(amounts, periods, salts, ALICE, 4, limbs_for(ALICE, amounts, periods, salts));
}

#[test(should_fail)]
fn test_rejects_non_consecutive_periods() {
    let salts = [[0; 32]; 3];
    let amounts = [2_500_000_000, 2_600_000_000, 2_700_000_000];
    let periods = [7, 8, 10];
    main(amounts, periods, salts, ALICE, 4, limbs_for(ALICE, amounts, periods, salts));
}

#[test(should_fail)]
fn test_rejects_commitments_that_do_not_open() {
    let salts = [[0; 32]; 3];
    let amounts = [2_500_000_000, 2_600_000_000, 2_700_000_000];
    let periods = [7, 8, 9];
    let wrong = [amounts[0] + 1, amounts[1] + 1, amounts[2] + 1];
    main(amounts, periods, salts, ALICE, 4, limbs_for(ALICE, wrong, periods, salts));
}

#[test(should_fail)]
fn test_rejects_an_unknown_band() {
    let salts = [[0; 32]; 3];
    let amounts = [2_500_000_000, 2_600_000_000, 2_700_000_000];
    let periods = [7, 8, 9];
    main(amounts, periods, salts, ALICE, 99, limbs_for(ALICE, amounts, periods, salts));
}

/// The public ABI calls this word an address, so anything wider must be
/// rejected rather than silently truncated by the consumer.
#[test(should_fail)]
fn test_rejects_a_recipient_wider_than_an_address() {
    let salts = [[0; 32]; 3];
    let wide: Field = 0x10000000000000000000000000000000000000000;
    let amounts = [2_500_000_000, 2_600_000_000, 2_700_000_000];
    let periods = [7, 8, 9];
    main(amounts, periods, salts, wide, 4, limbs_for(wide, amounts, periods, salts));
}

/// u64 amounts make the truncation gap unrepresentable: the largest value the
/// witness can hold is still above every band, so no band accepts it.
#[test(should_fail)]
fn test_rejects_the_largest_representable_amount() {
    let salts = [[0; 32]; 3];
    let amounts = [0xffffffffffffffff, 0xffffffffffffffff, 0xffffffffffffffff];
    let periods = [7, 8, 9];
    main(amounts, periods, salts, ALICE, 9, limbs_for(ALICE, amounts, periods, salts));
}

/// The claim is a pure function of the evidence, so identical evidence cannot
/// produce two distinct claims.
#[test]
fn test_identical_evidence_yields_identical_public_inputs() {
    let salts = [[0; 32]; 3];
    let amounts = [2_500_000_000, 2_600_000_000, 2_700_000_000];
    let periods = [7, 8, 9];

    let a = limbs_for(ALICE, amounts, periods, salts);
    let b = limbs_for(ALICE, amounts, periods, salts);

    for i in 0..PERIODS {
        assert(a[i][0] == b[i][0]);
        assert(a[i][1] == b[i][1]);
    }
}
