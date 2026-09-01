"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLogin, usePrivy, useSignMessage, useWallets } from "@privy-io/react-auth";
import { ArrowRight, PenNib, Plugs } from "@phosphor-icons/react";
import { Callout } from "@/components/app/Callout";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { useFlowSession } from "@/components/app/useFlowSession";
import { Button, ButtonLink } from "@/components/ui/Button";
import { parseOutcome, truncateAddress } from "@/lib/app";
import { demoSubject } from "@/lib/mock";

type StepStatus = "idle" | "working" | "done" | "error";

const OWNERSHIP_MESSAGE =
  "This address is mine. Orru will only look up incoming payments to it. Nothing is moved.";

export function ConnectScreen() {
  const router = useRouter();
  const search = useSearchParams();
  const outcome = parseOutcome(search.get("state"));
  const errorKind = search.get("error");
  const requestId = search.get("request");
  const { session, update, clear } = useFlowSession();
  const [connect, setConnect] = useState<StepStatus>("idle");
  const [sign, setSign] = useState<StepStatus>("idle");
  const [cleared, setCleared] = useState(false);
  const { ready: privyReady, authenticated, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { login } = useLogin({
    onComplete: () => {
      if (parseOutcome(search.get("state"))) return;
      setCleared(false);
      setConnect("done");
    },
    onError: () => {
      setConnect("idle");
    },
  });

  const qa = outcome !== null;
  const forcedEmpty = outcome === "empty";
  const forcedError = outcome === "error";
  const forcedLoading = outcome === "loading";
  const networkError = forcedError && errorKind === "network";
  const signatureError = forcedError && errorKind !== "network";

  const liveAddress =
    wallets.find((wallet) => wallet.address)?.address ??
    user?.wallet?.address ??
    session.address ??
    null;
  const privyConnected = privyReady && authenticated && Boolean(liveAddress);

  const connected =
    !cleared &&
    (outcome === "success" ||
      connect === "done" ||
      signatureError ||
      (qa ? session.connected : privyReady ? privyConnected : session.connected));
  const signed =
    !cleared && (outcome === "success" || sign === "done" || session.signed);

  const displayAddress = qa
    ? demoSubject.displayAddress
    : liveAddress
      ? truncateAddress(liveAddress)
      : null;

  useEffect(() => {
    if (cleared || qa || !privyReady || !authenticated || !liveAddress) return;
    setConnect((status) => (status === "done" ? status : "done"));
    if (
      session.connected &&
      session.address?.toLowerCase() === liveAddress.toLowerCase()
    ) {
      return;
    }
    update({
      address: liveAddress,
      connected: true,
      signed:
        session.address?.toLowerCase() === liveAddress.toLowerCase()
          ? session.signed
          : false,
      requestId: requestId ?? session.requestId,
    });
  }, [
    qa,
    cleared,
    privyReady,
    authenticated,
    liveAddress,
    requestId,
    session.address,
    session.connected,
    session.requestId,
    session.signed,
    update,
  ]);

  async function onConnect() {
    if (forcedEmpty || networkError) return;
    setCleared(false);
    setConnect("working");
    if (qa) {
      window.setTimeout(() => {
        setConnect("done");
        update({ connected: true, requestId: requestId ?? session.requestId });
      }, 700);
      return;
    }
    login({ loginMethods: ["wallet"] });
  }

  async function onSign() {
    if (signatureError) {
      setSign("error");
      return;
    }
    setSign("working");
    if (qa) {
      window.setTimeout(() => {
        setSign("done");
        update({ signed: true });
      }, 900);
      return;
    }
    if (!liveAddress) {
      setSign("idle");
      return;
    }
    try {
      await signMessage(
        { message: OWNERSHIP_MESSAGE },
        {
          address: liveAddress,
          uiOptions: { title: "Sign a short message" },
        },
      );
      setSign("done");
      update({
        address: liveAddress,
        connected: true,
        signed: true,
        requestId: requestId ?? session.requestId,
      });
    } catch {
      setSign("error");
    }
  }

  async function onDisconnect() {
    if (!qa) {
      try {
        await logout();
      } catch {
        /* ignore */
      }
    }
    clear();
    setCleared(true);
    setConnect("idle");
    setSign("idle");
  }

  return (
    <ScreenFrame
      kicker="01 · Connect"
      title="Connect the wallet you get paid into."
      lede="This has to be the address that receives pay — not a spare one. You will sign a short message to show it is yours. Nothing is moved."
    >
      {forcedEmpty ? (
        <Callout
          tone="empty"
          title="No wallet found in this browser"
          body="Install a wallet, then come back to this page. The address you connect must be the one that receives pay."
          actionLabel="Back to the start"
          actionHref="/"
        />
      ) : null}

      {networkError ? (
        <Callout
          tone="error"
          title="This address is on a network we do not check yet"
          body="Switch the wallet to Creditcoin and connect again. Other networks are ignored for now."
          actionLabel="Try again"
          actionHref="/connect"
        />
      ) : null}

      {sign === "error" ? (
        <Callout
          tone="error"
          title="The signature was not completed"
          body="You can decline the message. Without it we cannot show that the address is yours, and we will not look anything up."
        >
          <div className="mt-5">
            <Button onClick={() => setSign("idle")}>Try the message again</Button>
          </div>
        </Callout>
      ) : null}

      {!forcedEmpty && !networkError ? (
        <ol className="divide-y divide-rule border-y border-rule">
          <li className="flex flex-col gap-4 py-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              <Plugs size={20} className="mt-0.5 shrink-0 text-brand" />
              <div>
                <p className="display-sm text-ink">Connect the address</p>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
                  We only read the address. No permission is granted to send
                  funds.
                </p>
                {connected && displayAddress ? (
                  <p className="meta mt-3 text-ink">{displayAddress}</p>
                ) : null}
              </div>
            </div>
            <Button
              onClick={() => void onConnect()}
              disabled={connected || forcedLoading || (!qa && !privyReady)}
              className="shrink-0"
            >
              {forcedLoading || connect === "working"
                ? "Looking…"
                : connected
                  ? "Connected"
                  : "Connect"}
            </Button>
          </li>

          <li className="flex flex-col gap-4 py-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              <PenNib size={20} className="mt-0.5 shrink-0 text-brand" />
              <div>
                <p className="display-sm text-ink">Sign a short message</p>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
                  The message says this address is yours. Signing costs nothing
                  and can be cancelled.
                </p>
              </div>
            </div>
            <Button
              onClick={() => void onSign()}
              disabled={!connected || signed || forcedLoading}
              variant={connected ? "solid" : "outline"}
              className="shrink-0"
            >
              {sign === "working"
                ? "Waiting…"
                : signed
                  ? "Signed"
                  : "Sign"}
            </Button>
          </li>
        </ol>
      ) : null}

      <div className="mt-10 flex flex-wrap items-center gap-4">
        {signed ? (
          <Button
            onClick={() => {
              const query = requestId ? `?request=${requestId}` : "";
              router.push(`/review${query}`);
            }}
          >
            Continue
            <ArrowRight size={18} />
          </Button>
        ) : (
          <ButtonLink href="/" variant="quiet">
            Cancel
          </ButtonLink>
        )}
        {connected && !forcedEmpty && !networkError ? (
          <Button type="button" variant="quiet" onClick={() => void onDisconnect()}>
            Disconnect
          </Button>
        ) : null}
      </div>
    </ScreenFrame>
  );
}
