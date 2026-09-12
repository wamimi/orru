import { ADDRESSES, CREDITCOIN_ID, TOKEN_DECIMALS, creditcoin } from "@/lib/chain";

export const MUSDC = {
  address: ADDRESSES[CREDITCOIN_ID].settlementToken,
  symbol: "mUSDC",
  decimals: TOKEN_DECIMALS,
  chainId: CREDITCOIN_ID,
} as const;

export const MUSDC_WATCH_ASSET = {
  type: "ERC20",
  options: {
    address: MUSDC.address,
    symbol: MUSDC.symbol,
    decimals: MUSDC.decimals,
  },
} as const;

export const CREDITCOIN_WALLET_CHAIN = {
  chainId: `0x${CREDITCOIN_ID.toString(16)}`,
  chainName: creditcoin.name,
  nativeCurrency: creditcoin.nativeCurrency,
  rpcUrls: [...creditcoin.rpcUrls.default.http],
  blockExplorerUrls: [creditcoin.blockExplorers.default.url],
} as const;
