"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { creditcoin } from "@/lib/chain";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export function PrivyProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!privyAppId) {
    return children;
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["wallet"],
        appearance: {
          theme: "light",
          accentColor: "#1F4A2C",
          walletChainType: "ethereum-only",
          showWalletLoginFirst: true,
        },
        defaultChain: creditcoin,
        supportedChains: [creditcoin],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "off",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
