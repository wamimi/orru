//! Payment commitment, mirroring keccak256(abi.encode(...)) on-chain.

use keccak256::keccak256;

/// abi.encode lays out each field as a 32-byte big-endian word:
/// recipient, amount, period, salt.
///
/// Values must stay below the bn254 modulus or they are reduced silently.
pub fn commitment(recipient: Field, amount: Field, period: Field, salt: [u8; 32]) -> [u8; 32] {
    let r: [u8; 32] = recipient.to_be_bytes();
    let a: [u8; 32] = amount.to_be_bytes();
    let p: [u8; 32] = period.to_be_bytes();

    let mut buf: [u8; 128] = [0; 128];
    for i in 0..32 {
        buf[i] = r[i];
        buf[32 + i] = a[i];
        buf[64 + i] = p[i];
        buf[96 + i] = salt[i];
    }

    keccak256(buf, 128)
}

/// Fixed vector shared with the Solidity and TypeScript implementations.
#[test]
fn test_matches_solidity() {
    let recipient = 0xf6A48D18DA6072eaDdBF5D2BfB9FE9263dE0b66C;
    let amount = 50000;      // 0.05 USDC, six decimals
    let period = 2;
    let salt: [u8; 32] = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff];

    let expected: [u8; 32] = [0x17, 0xae, 0xdd, 0xb6, 0x87, 0xd3, 0x15, 0xc5, 0x64, 0xeb, 0xb7, 0x27, 0x6e, 0xd8, 0x8c, 0x25, 0x3d, 0x82, 0xc1, 0xb2, 0x1a, 0x76, 0x10, 0xc6, 0xc9, 0x63, 0xe8, 0xf3, 0x17, 0xdb, 0xbf, 0xb5];
    let got = commitment(recipient, amount, period, salt);

    for i in 0..32 {
        assert(got[i] == expected[i]);
    }
}

#[test]
fn test_every_field_separates() {
    let salt: [u8; 32] = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff];
    let base = commitment(0xf6A48D18DA6072eaDdBF5D2BfB9FE9263dE0b66C, 50000, 2, salt);

    let diff_recipient = commitment(0xe058c2056249287B429607814C9F21Ed48cE3B34, 50000, 2, salt);
    let diff_amount = commitment(0xf6A48D18DA6072eaDdBF5D2BfB9FE9263dE0b66C, 50001, 2, salt);
    let diff_period = commitment(0xf6A48D18DA6072eaDdBF5D2BfB9FE9263dE0b66C, 50000, 3, salt);

    let mut same_r = true;
    let mut same_a = true;
    let mut same_p = true;
    for i in 0..32 {
        if base[i] != diff_recipient[i] { same_r = false; }
        if base[i] != diff_amount[i] { same_a = false; }
        if base[i] != diff_period[i] { same_p = false; }
    }
    assert(!same_r);
    assert(!same_a);
    assert(!same_p);
}
