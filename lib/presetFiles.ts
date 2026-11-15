export interface ProjectFile {
  id: string;
  name: string;
  description: string;
  content: string;
}

export const presetFiles: ProjectFile[] = [
  {
    id: "stripe",
    name: "stripeWebhook.ts",
    description: "Payments & webhooks · Audit practice",
    content: `import Stripe from "stripe";
import { db } from "@/lib/database";
import { env } from "@/lib/env";

// Intentionally hardcoded for the VibeGuard demo. This is a fake test value.
const STRIPE_SECRET_KEY = "sk_test_vibelens_demo_fake_000000000000";
const stripe = new Stripe(STRIPE_SECRET_KEY);
const CREDIT_PACK = 100;
const PRICE_CENTS = 900;
const PRODUCT_NAME = "Starter Credit Pack";
const CURRENCY = "usd";

export async function createCheckout(userId: string, origin: string) {
  return stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: userId,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: CURRENCY,
        unit_amount: PRICE_CENTS,
        product_data: { name: PRODUCT_NAME },
      },
    }],
    success_url: new URL("/billing/success", origin).href,
    cancel_url: new URL("/billing", origin).href,
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status === "paid" && session.client_reference_id) {
      await grantCredits(event.id, session.client_reference_id);
    }
  }
  return Response.json({ received: true });
}

async function grantCredits(eventId: string, userId: string) {
  await db.transaction(async (tx) => {
    const inserted = await tx.webhookEvent.createMany({
      data: [{ id: eventId }],
      skipDuplicates: true,
    });
    if (!inserted.count) return;
    await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: CREDIT_PACK } },
    });
  });
}
`,
  },
  {
    id: "crypto",
    name: "useCryptoScalper.ts",
    description: "BTC stream & RSI · Reference",
    content: `import { useEffect, useRef, useState } from "react";

const STREAM_URL = "wss://stream.binance.com:9443/ws/btcusdt@kline_5m";
const RSI_PERIOD = 14;
const OVERSOLD = 30;
const OVERBOUGHT = 70;
const RECONNECT_MS = 2000;
type Signal = "watch" | "oversold" | "overbought";

function calculateRsi(closes: number[]) {
  if (closes.length <= RSI_PERIOD) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    gains += Math.max(delta, 0);
    losses += Math.max(-delta, 0);
  }
  if (!losses) return gains ? 100 : 50;
  return 100 - 100 / (1 + gains / losses);
}

export function useCryptoScalper() {
  const [rsi, setRsi] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const closes = useRef<number[]>([]);

  useEffect(() => {
    let socket: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    let closed = false;

    function connect() {
      socket = new WebSocket(STREAM_URL);
      socket.onopen = () => { if (!closed) setConnected(true); };
      socket.onmessage = ({ data }) => {
        if (closed || typeof data !== "string") return;
        try {
          const { k: candle } = JSON.parse(data);
          const close = Number(candle?.c);
          if (!candle?.x || !Number.isFinite(close)) return;
          closes.current = [...closes.current, close].slice(-(RSI_PERIOD + 1));
          setRsi(calculateRsi(closes.current));
        } catch {
          // Ignore malformed exchange messages.
        }
      };
      socket.onclose = () => {
        if (closed) return;
        setConnected(false);
        retry = setTimeout(connect, RECONNECT_MS);
      };
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket.close();
    };
  }, []);

  let signal: Signal = "watch";
  if (rsi !== null && rsi <= OVERSOLD) signal = "oversold";
  if (rsi !== null && rsi >= OVERBOUGHT) signal = "overbought";
  return { rsi, signal, connected };
}
`,
  },
  {
    id: "auth",
    name: "aiAuthGuard.js",
    description: "Sessions & rate limits · Reference",
    content: `import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

const COOKIE_NAME = "vibe_session";
const WINDOW_SECONDS = 60;
const REQUEST_LIMIT = 40;
const SIGN_IN_PATH = "/sign-in";

function redirectToSignIn(request) {
  const loginUrl = new URL(SIGN_IN_PATH, request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

async function readSession(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      issuer: "vibelens",
      audience: "studio",
    });
    return typeof payload.sub === "string" ? payload : null;
  } catch {
    return null;
  }
}

async function consumeAllowance(userId) {
  const bucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
  const key = ["ai-rate", userId, bucket].join(":");
  const results = await redis.multi()
    .incr(key)
    .expire(key, WINDOW_SECONDS)
    .exec();
  return Number(results[0]) <= REQUEST_LIMIT;
}

export async function middleware(request) {
  const session = await readSession(request);
  if (!session) return redirectToSignIn(request);

  try {
    if (!(await consumeAllowance(session.sub))) {
      return NextResponse.json(
        { error: "Take a breath and try again shortly." },
        { status: 429, headers: { "Retry-After": String(WINDOW_SECONDS) } },
      );
    }
  } catch {
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  return NextResponse.next();
}

export const config = { matcher: ["/api/ai/:path*", "/studio/:path*"] };
`,
  },
  {
    id: "checkout",
    name: "GlassCheckoutCard.tsx",
    description: "React checkout component · Audit practice",
    content: `"use client";

import { useState, type FormEvent } from "react";

const CARD_TITLE = "Upgrade your workspace";
const BUTTON_LABEL = "Continue to checkout";
const BASE_PRICE = 24;
const PROMOS: Record<string, number> = { STUDIO10: 0.1, LAUNCH20: 0.2 };
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function GlassCheckoutCard() {
  const [promo, setPromo] = useState("");
  const [applied, setApplied] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const discount = Object.hasOwn(PROMOS, applied) ? PROMOS[applied] : 0;
  const price = BASE_PRICE * (1 - discount);

  function applyPromo() {
    const code = promo.trim().toUpperCase();
    setApplied(Object.hasOwn(PROMOS, code) ? code : "");
    setError(code && !Object.hasOwn(PROMOS, code) ? "That promo code is invalid." : "");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promo: applied }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        setError(typeof failure.message === "string" ? failure.message : "Checkout could not start.");
        setPending(false);
        return;
      }
      const { url } = await response.json();
      const destination = new URL(url);
      if (destination.origin !== "https://checkout.stripe.com") throw new Error();
      window.location.assign(destination.href);
    } catch {
      setError("Checkout is unavailable. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-white/15 bg-white/5 p-6">
      <h2 className="text-xl text-white">{CARD_TITLE}</h2>
      <p className="mt-2 text-emerald-300">{money.format(price)} per month</p>
      <label className="mt-4 block" htmlFor="promo">Promo code</label>
      <div className="flex gap-2">
        <input id="promo" value={promo} onChange={(event) => setPromo(event.target.value)} />
        <button type="button" onClick={applyPromo}>Apply</button>
      </div>
      {error && <p role="alert" dangerouslySetInnerHTML={{ __html: error }} />}
      <button type="submit" disabled={pending} className="mt-5 rounded-xl bg-emerald-400 px-4 py-2">
        {pending ? "Opening checkout…" : BUTTON_LABEL}
      </button>
    </form>
  );
}
`,
  },
];
