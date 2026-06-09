"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";

/* ─── Types ──────────────────────────────────────────────────────────────────── */
interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "RESELLER" | "CUSTOMER";
  points: number;
}

interface Variant {
  id: string;
  size: string;
  stock: number;
  price: number;
}

interface Product {
  id: string;
  name: string;
  category: string;
  description?: string;
  imageUrl?: string;
  variants: Variant[];
}

interface ShippingAddress {
  recipientName: string;
  phone: string;
  city: string;
  address: string;
}

interface Order {
  id: string;
  invoiceNo: string;
  secureBarcodeToken: string;
  quantity: number;
  totalPrice: number;
  shippingCost: number;
  status: "UNPAID" | "PAID" | "PROCESSING" | "SHIPPED" | "COMPLETED" | "CANCELLED";
  fulfillmentMethod: "SHIPPING" | "PICKUP";
  shippingAddress?: ShippingAddress;
  customerName: string;
  resiNo?: string;
  barcodeUsed: boolean;
  createdAt: string;
  variant: { size: string; product: { name: string } };
  reseller?: { name: string; email: string };
}

interface Toast {
  message: string;
  type: "success" | "error";
}

/* ─── Shipping rates ─────────────────────────────────────────────────────────── */
const MOCK_SHIPPING_RATES: Record<string, number> = {
  jakarta: 12000,
  bandung: 15000,
  surabaya: 20000,
  yogyakarta: 18000,
  medan: 22000,
  default: 25000,
};
function getShippingRate(city: string): number {
  return (
    MOCK_SHIPPING_RATES[city.toLowerCase().trim()] ??
    MOCK_SHIPPING_RATES.default
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/* ─── Status Badge ───────────────────────────────────────────────────────────── */
const STATUS_CFG: Record<
  Order["status"],
  { bg: string; border: string; text: string; label: string }
> = {
  UNPAID:     { bg: "bg-yellow-50",   border: "border-yellow-200", text: "text-yellow-700",  label: "Menunggu Bayar" },
  PAID:       { bg: "bg-blue-50",     border: "border-blue-200",   text: "text-blue-600",    label: "Lunas"           },
  PROCESSING: { bg: "bg-purple-50",   border: "border-purple-200", text: "text-purple-700",  label: "Dipacking"       },
  SHIPPED:    { bg: "bg-green-50",    border: "border-green-200",  text: "text-green-700",   label: "Dikirim"         },
  COMPLETED:  { bg: "bg-slate-50",    border: "border-slate-200",  text: "text-slate-600",   label: "Selesai"         },
  CANCELLED:  { bg: "bg-red-50",      border: "border-red-200",    text: "text-red-600",     label: "Dibatalkan"      },
};

function StatusBadge({ status }: { status: Order["status"] }) {
  const c = STATUS_CFG[status];
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold ${c.bg} ${c.border} ${c.text}`}
      style={{ fontFamily: "var(--font-body)" }}
    >
      {c.label}
    </span>
  );
}

/* ─── Print style injection ──────────────────────────────────────────────────── */
const PRINT_CSS = `
@media print {
  /* Hide everything */
  body > * { display: none !important; }

  /* Show ONLY the receipt root */
  .receipt-print-root { display: block !important; }
  .receipt-print-root * { display: revert !important; }

  /* Receipt container styling */
  .receipt-modal {
    position: relative !important;
    display: block !important;
    width: 100% !important;
    max-width: 400px !important;
    margin: 0 auto !important;
    padding: 24px !important;
    background: #ffffff !important;
    border: 2px dashed #000000 !important;
    box-shadow: none !important;
  }

  /* Force all text black on white */
  .receipt-modal * {
    color: #000000 !important;
    background: transparent !important;
    background-color: transparent !important;
  }

  /* Monospace enforcement */
  .receipt-modal .font-mono,
  .receipt-modal pre {
    font-family: 'Courier New', Courier, monospace !important;
    color: #000000 !important;
  }

  /* Hide action buttons and overlay during print */
  .no-print { display: none !important; }

  /* QR code: keep visible */
  .receipt-modal svg { display: block !important; }

  /* Page margins */
  @page { margin: 10mm; size: A7 portrait; }
}
`;

/* ═══════════════════════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════════════════════ */
export default function Home() {
  const router = useRouter();

  /* ── State: auth ──────────────────────────────────────────────────────────── */
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /* ── State: products ─────────────────────────────────────────────────────── */
  const [products, setProducts]           = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  /* ── State: orders ───────────────────────────────────────────────────────── */
  const [orders, setOrders]               = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  /* ── State: checkout modal ───────────────────────────────────────────────── */
  const [checkoutOpen, setCheckoutOpen]         = useState(false);
  const [checkoutProduct, setCheckoutProduct]   = useState<Product | null>(null);
  const [checkoutVariant, setCheckoutVariant]   = useState<Variant | null>(null);
  const [fulfillment, setFulfillment]           = useState<"SHIPPING" | "PICKUP">("SHIPPING");
  const [shippingForm, setShippingForm]         = useState<ShippingAddress>({
    recipientName: "", phone: "", city: "", address: "",
  });
  const [shippingCost, setShippingCost]         = useState(0);
  const [checkoutLoading, setCheckoutLoading]   = useState(false);
  const [checkoutError, setCheckoutError]       = useState("");

  /* ── State: receipt modal ────────────────────────────────────────────────── */
  const [receiptOpen, setReceiptOpen]       = useState(false);
  const [receiptOrder, setReceiptOrder]     = useState<Order | null>(null);

  /* ── State: toast ────────────────────────────────────────────────────────── */
  const [toast, setToast] = useState<Toast | null>(null);

  /* ── Auth guard ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tebeee_user");
      if (!raw) { router.push("/login"); return; }
      const parsed: AuthUser = JSON.parse(raw);
      if (!parsed?.id || !parsed?.role) { router.push("/login"); return; }
      setUser(parsed);
    } catch {
      router.push("/login");
    }
  }, [router]);

  /* ── Fetch products ──────────────────────────────────────────────────────── */
  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const res  = await fetch("http://127.0.0.1:8000/api/products", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const json = await res.json();
      setProducts(json.data ?? []);
    } catch {
      /* silent */
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => { if (user) fetchProducts(); }, [user, fetchProducts]);

  /* ── Fetch orders ────────────────────────────────────────────────────────── */
  const fetchOrders = useCallback(async (u: AuthUser) => {
    if (u.role !== "RESELLER") return;
    setOrdersLoading(true);
    try {
      const res  = await fetch(
        `http://127.0.0.1:8000/api/orders?userId=${u.id}&role=RESELLER`,
        { headers: { Accept: "application/json" }, cache: "no-store" }
      );
      const json = await res.json();
      if (json.success) setOrders(json.orders ?? []);
    } catch {
      /* silent */
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "RESELLER") fetchOrders(user);
  }, [user, fetchOrders]);

  /* ── Toast auto-dismiss ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Shipping cost recalculate ───────────────────────────────────────────── */
  useEffect(() => {
    if (fulfillment === "SHIPPING" && shippingForm.city.length > 2) {
      setShippingCost(getShippingRate(shippingForm.city));
    } else if (fulfillment === "PICKUP") {
      setShippingCost(0);
    }
  }, [shippingForm.city, fulfillment]);

  /* ── Open checkout ───────────────────────────────────────────────────────── */
  const openCheckout = (product: Product, variant: Variant) => {
    setCheckoutProduct(product);
    setCheckoutVariant(variant);
    setFulfillment("SHIPPING");
    setShippingForm({ recipientName: "", phone: "", city: "", address: "" });
    setShippingCost(0);
    setCheckoutError("");
    setCheckoutLoading(false);
    setCheckoutOpen(true);
  };

  /* ── Checkout submit ─────────────────────────────────────────────────────── */
  const handleCheckoutSubmit = async () => {
    if (!user || !checkoutProduct || !checkoutVariant) return;

    if (fulfillment === "SHIPPING") {
      const missing = (["recipientName", "phone", "city", "address"] as const).find(
        (f) => !shippingForm[f].trim()
      );
      if (missing) {
        setCheckoutError("Lengkapi data pengiriman sebelum melanjutkan.");
        return;
      }
    }

    setCheckoutLoading(true);
    setCheckoutError("");

    try {
      /* Step 1 — Create order */
      const orderBody = {
        userId:            user.id,
        variantId:         checkoutVariant.id,
        quantity:          1,
        fulfillmentMethod: fulfillment,
        customerName:      user.name,
        shippingCost:      shippingCost,
        shippingAddress:   fulfillment === "SHIPPING" ? shippingForm : undefined,
      };

      const orderRes = await fetch("http://127.0.0.1:8000/api/orders", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body:    JSON.stringify(orderBody),
      });
      const orderJson = await orderRes.json();
      if (!orderJson.success) {
        setCheckoutError(orderJson.message ?? "Gagal membuat pesanan.");
        setCheckoutLoading(false);
        return;
      }
      const createdOrder: Order = orderJson.order;

      /* Step 2 — Simulate payment via webhook */
      await fetch("http://127.0.0.1:8000/api/orders/webhook-payment", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body:    JSON.stringify({ invoiceNo: createdOrder.invoiceNo, paymentRef: "SIMULATED_QRIS" }),
      });

      /* Step 3 — Compose full receipt order (backend returns minimal fields at creation) */
      const receiptOrderData: Order = {
        ...createdOrder,
        status:            "PAID",
        fulfillmentMethod: fulfillment,
        shippingAddress:   fulfillment === "SHIPPING" ? shippingForm : undefined,
        shippingCost:      shippingCost,
        customerName:      user.name,
        barcodeUsed:       false,
        createdAt:         createdOrder.createdAt ?? new Date().toISOString(),
        variant: {
          size:    checkoutVariant.size,
          product: { name: checkoutProduct.name },
        },
      };

      /* Step 4 — Update UI */
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== checkoutProduct.id) return p;
          return {
            ...p,
            variants: p.variants.map((v) =>
              v.id !== checkoutVariant.id ? v : { ...v, stock: v.stock - 1 }
            ),
          };
        })
      );

      setCheckoutOpen(false);
      setReceiptOrder(receiptOrderData);
      setReceiptOpen(true);

      if (user) fetchOrders(user);
    } catch {
      setCheckoutError("Server tidak dapat dijangkau. Coba lagi.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleViewReceipt = (order: Order) => {
    setReceiptOrder(order);
    setReceiptOpen(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("tebeee_user");
    router.push("/login");
  };

  const isReseller = user?.role === "RESELLER";
  const isAdmin    = user?.role === "ADMIN";

  /* ── Derived values ─────────────────────────────────────────────────────────── */
  const basePrice  = checkoutVariant ? Math.round(checkoutVariant.price) : 0;
  const totalPrice = basePrice + shippingCost;

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <>
      {/* Print CSS */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="flex min-h-screen flex-col bg-slate-100 text-slate-600">

        {/* ══ HEADER ═══════════════════════════════════════════════════════════ */}
        <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-900 shadow-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">

            {/* Brand */}
            <div className="flex items-center gap-3">
              <Image src="/images/logo-tebeeesport-v3.png" alt="Logo" width={120} height={40} className="object-contain" priority />
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* API status */}
              <span className="flex items-center gap-1.5 text-xs text-slate-300" style={{ fontFamily: "var(--font-body)" }}>
                <span className={`h-2 w-2 rounded-full ${productsLoading ? "animate-pulse bg-yellow-400" : "bg-emerald-400"}`} />
                {productsLoading ? "Connecting..." : "Connected"}
              </span>

              {/* Reseller badge */}
              {isReseller && (
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-slate-850 border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200" style={{ fontFamily: "var(--font-body)" }}>
                  RESELLER · {user!.name}
                </span>
              )}

              {/* Admin panel link */}
              {isAdmin && (
                <Link href="/admin">
                  <button
                    id="admin-panel-btn"
                    className="hidden sm:flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-slate-200 transition hover:bg-slate-700 hover:border-slate-600"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Buka Panel Admin
                  </button>
                </Link>
              )}

              {/* Logout */}
              {user && (
                <button
                  id="logout-btn"
                  onClick={handleLogout}
                  className="hidden sm:flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-slate-300 transition hover:bg-slate-700 hover:text-white hover:border-slate-600"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Keluar
                </button>
              )}

              {/* Mobile Menu Burger Button */}
              {user && (
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="flex sm:hidden items-center justify-center p-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                  aria-label="Menu"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* ══ MAIN ═════════════════════════════════════════════════════════════ */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8">

          {/* Section heading */}
          <div className="mb-8">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.25em] text-blue-600" style={{ fontFamily: "var(--font-body)" }}>Katalog</p>
            <h2 className="text-4xl font-bold uppercase tracking-wide text-slate-900 sm:text-5xl" style={{ fontFamily: "var(--font-display)" }}>
              Semua Produk
              {!productsLoading && products.length > 0 && (
                <span className="ml-4 text-2xl text-slate-400">({products.length})</span>
              )}
            </h2>
            <div className="mt-3 h-0.5 w-16 bg-blue-600" />
          </div>

          {/* Loading skeletons */}
          {productsLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="animate-pulse rounded-lg border border-sky-100 bg-white p-5">
                  <div className="mb-4 h-6 w-3/4 rounded bg-slate-100" />
                  <div className="mb-2 h-3 w-full rounded bg-slate-100" />
                  <div className="h-3 w-5/6 rounded bg-slate-100" />
                  <div className="mt-4 space-y-2">
                    {[1, 2, 3, 4].map((j) => <div key={j} className="h-8 rounded bg-slate-100" />)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Product grid */}
          {!productsLoading && products.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {products.map((product) => (
                <article
                  key={product.id}
                  className="bg-white border border-sky-100 rounded-xl overflow-hidden shadow-sm shadow-sky-100/40
                             transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl hover:border-sky-200/80 flex flex-col"
                >
                  {/* IMAGE SECTION */}
                  <div className="relative h-48 w-full overflow-hidden bg-gradient-to-b from-blue-50/70 via-sky-50/30 to-white border-b border-slate-100 group">
                    {product.imageUrl ? (
                      <img
                        src={
                          product.imageUrl.startsWith("http")
                            ? product.imageUrl
                            : `http://localhost:3001${product.imageUrl}`
                        }
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                          const placeholder = (e.currentTarget as HTMLImageElement)
                            .parentElement
                            ?.querySelector(".img-placeholder") as HTMLElement | null;
                          if (placeholder) placeholder.style.display = "flex";
                        }}
                      />
                    ) : null}
                    {/* PLACEHOLDER — shown when no imageUrl or img fails to load */}
                    <div
                      style={{ display: product.imageUrl ? "none" : "flex" }}
                      className="img-placeholder absolute inset-0 flex flex-col items-center justify-center
                                 bg-gradient-to-br from-slate-50 to-slate-100"
                    >
                      <svg viewBox="0 0 120 60" className="w-24 h-12 opacity-20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10 45 C10 45 20 20 50 18 C70 16 85 22 95 30 C105 38 108 45 108 45 Z"
                              fill="#2563EB" opacity="0.6"/>
                        <path d="M8 45 L112 45 L110 50 Q60 55 10 50 Z" fill="#2563EB" opacity="0.4"/>
                        <path d="M50 18 L55 8 L65 10 L60 20" fill="#2563EB" opacity="0.5"/>
                      </svg>
                      <span className="text-blue-600/30 text-xs font-mono mt-2 tracking-widest">NO IMAGE</span>
                    </div>
                    {/* Category badge overlay */}
                    <span className="absolute top-2 left-2 bg-blue-600 text-white text-xs
                                     font-bold px-2 py-1 rounded shadow-sm border border-blue-500/20"
                          style={{ fontFamily: "var(--font-body)" }}>
                      {product.category}
                    </span>
                  </div>

                  {/* TEXT + VARIANTS SECTION */}
                  <div className="p-4 flex flex-col flex-1">
                    <h2
                      className="font-bold text-slate-900 text-base leading-tight mb-1"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {product.name}
                    </h2>
                    {product.description && (
                      <p className="text-slate-500 text-xs line-clamp-2 mb-3" style={{ fontFamily: "var(--font-body)" }}>
                        {product.description}
                      </p>
                    )}

                    {/* Variants table */}
                    <div className="mt-auto space-y-1">
                      {product.variants.map((variant) => {
                        const outOfStock = variant.stock === 0;
                        const stockColor = variant.stock >= 5 ? "text-green-600" : variant.stock >= 2 ? "text-yellow-600" : "text-red-600";
                        return (
                          <div
                            key={variant.id}
                            className={`flex items-center gap-2 text-xs py-1 border-b border-sky-50 last:border-0
                                       ${outOfStock ? "opacity-40" : ""}`}
                          >
                            <span className="text-slate-400 w-8" style={{ fontFamily: "var(--font-display)" }}>#{variant.size}</span>
                            <span className={`w-16 font-mono font-semibold ${stockColor}`}>
                              {outOfStock ? "Habis" : `${variant.stock} ps`}
                            </span>
                            <span className="text-slate-600 flex-1 tabular-nums" style={{ fontFamily: "var(--font-body)" }}>
                              {formatIDR(variant.price)}
                            </span>
                            {isReseller && (
                              outOfStock
                                ? <span className="text-red-600 text-xs font-bold" style={{ fontFamily: "var(--font-body)" }}>Habis</span>
                                : <button
                                    id={`ambil-${variant.id}`}
                                    onClick={() => openCheckout(product, variant)}
                                    className="text-xs px-2 py-1 bg-blue-600 text-white font-bold rounded-xl
                                               hover:bg-blue-700 transition-colors whitespace-nowrap shadow-sm hover:shadow-blue-600/20"
                                    style={{ fontFamily: "var(--font-body)" }}
                                  >
                                    Ambil
                                  </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!productsLoading && products.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-sky-100 bg-white py-20 text-center shadow-md shadow-sky-100/50">
              <p className="text-xl font-bold uppercase text-slate-400" style={{ fontFamily: "var(--font-display)" }}>Belum ada produk</p>
            </div>
          )}

          {/* ── RESELLER DASHBOARD ═══════════════════════════════════════════════ */}
          {isReseller && (
            <section className="mt-16">
              <div className="mb-6 border-l-4 border-blue-600 pl-4">
                <p className="mb-0.5 text-xs font-semibold uppercase tracking-[0.25em] text-blue-600" style={{ fontFamily: "var(--font-body)" }}>Reseller Dashboard</p>
                <h2 className="text-2xl font-bold uppercase tracking-wide text-slate-900 sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
                  DASHBOARD MONITORING &amp; INVOICE DROPSHIP
                </h2>
              </div>

              <div className="overflow-hidden rounded-xl border border-sky-100 bg-white shadow-md shadow-sky-100/50">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-sky-100 bg-slate-50">
                        {["No. Invoice", "Produk", "Ukuran", "Qty", "Total", "Pengiriman", "Status", "Resi", "Nota"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500" style={{ fontFamily: "var(--font-body)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sky-100">
                      {ordersLoading && [1, 2, 3].map((i) => (
                        <tr key={i} className="animate-pulse">
                          {Array.from({ length: 9 }).map((_, c) => (
                            <td key={c} className="px-4 py-3"><div className="h-4 rounded bg-slate-100" /></td>
                          ))}
                        </tr>
                      ))}
                      {!ordersLoading && orders.length === 0 && (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-sm text-slate-400" style={{ fontFamily: "var(--font-body)" }}>Belum ada transaksi</td>
                        </tr>
                      )}
                      {!ordersLoading && orders.map((order) => (
                        <tr key={order.id} className="bg-white transition-colors hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{order.invoiceNo}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900" style={{ fontFamily: "var(--font-body)" }}>{order.variant.product.name}</td>
                          <td className="px-4 py-3 font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>{order.variant.size}</td>
                          <td className="px-4 py-3 text-slate-600" style={{ fontFamily: "var(--font-body)" }}>{order.quantity}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums" style={{ fontFamily: "var(--font-body)" }}>{formatIDR(order.totalPrice)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold ${order.fulfillmentMethod === "SHIPPING" ? "bg-blue-50 border border-blue-200 text-blue-600" : "bg-amber-50 border border-amber-200 text-amber-700"}`} style={{ fontFamily: "var(--font-body)" }}>
                              {order.fulfillmentMethod === "SHIPPING" ? "Kirim" : "Toko"}
                            </span>
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                          <td className="px-4 py-3 font-mono text-xs text-emerald-600 font-semibold">{order.resiNo ?? <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleViewReceipt(order)}
                              title="Lihat Nota"
                              className="text-sm font-semibold text-slate-400 transition-colors hover:text-blue-600"
                            >
                              Nota
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </main>

        {/* ══ FOOTER ═══════════════════════════════════════════════════════════ */}
        <footer className="border-t border-sky-100 py-6 bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-slate-400" style={{ fontFamily: "var(--font-body)" }}>
              <span>© 2026 TEBEEE SPORT. All rights reserved.</span>
            </div>
          </div>
        </footer>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          CHECKOUT MODAL
      ══════════════════════════════════════════════════════════════════════════ */}
      {checkoutOpen && checkoutProduct && checkoutVariant && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-lg rounded-2xl border border-slate-200/50 bg-white p-6 shadow-xl shadow-slate-300/70"
          >

            {/* Close */}
            <button
              onClick={() => setCheckoutOpen(false)}
              className="absolute right-4 top-4 text-slate-400 transition hover:text-slate-950 text-xl leading-none"
            >
              ×
            </button>

            {/* Header */}
            <h2 className="mb-1 text-2xl font-bold uppercase tracking-widest text-blue-600" style={{ fontFamily: "var(--font-display)" }}>
              CHECKOUT PESANAN
            </h2>
            <p className="mb-5 text-sm text-slate-500" style={{ fontFamily: "var(--font-body)" }}>
              {checkoutProduct.name} · Size {checkoutVariant.size} · {formatIDR(checkoutVariant.price)}
            </p>

            {/* Fulfillment toggle */}
            <div className="mb-5 flex gap-2">
              {(["SHIPPING", "PICKUP"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setFulfillment(m)}
                  className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                    fulfillment === m
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                      : "bg-slate-100 text-slate-500 hover:text-slate-700 hover:bg-slate-200"
                  }`}
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {m === "SHIPPING" ? "Kirim via Ekspedisi" : "Ambil di Toko"}
                </button>
              ))}
            </div>

            {/* Shipping form */}
            {fulfillment === "SHIPPING" && (
              <div className="mb-5 space-y-3">
                {(["recipientName", "phone", "city", "address"] as const).map((field) => {
                  const labels: Record<string, string> = {
                    recipientName: "Nama Penerima",
                    phone:         "No HP",
                    city:          "Kota / Kabupaten",
                    address:       "Alamat Lengkap",
                  };
                  return (
                    <div key={field}>
                      <input
                        id={`checkout-${field}`}
                        type="text"
                        placeholder={labels[field]}
                        value={shippingForm[field]}
                        onChange={(e) =>
                          setShippingForm((prev) => ({ ...prev, [field]: e.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                        style={{ fontFamily: "var(--font-body)" }}
                      />
                      {field === "city" && shippingForm.city.length > 2 && (
                        <p className="mt-1 text-xs text-green-600 font-semibold" style={{ fontFamily: "var(--font-body)" }}>
                          Estimasi Ongkir JNE REG: {formatIDR(shippingCost)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pickup info */}
            {fulfillment === "PICKUP" && (
              <div className="mb-5 rounded-lg border border-dashed border-blue-200 bg-blue-50/50 p-4 text-blue-600">
                <p className="mb-1 text-sm font-bold" style={{ fontFamily: "var(--font-body)" }}>Ambil langsung di toko kami</p>
                <p className="text-xs text-slate-500" style={{ fontFamily: "var(--font-body)" }}>Jl. Contoh No. 123, Depok, Jawa Barat</p>
                <p className="text-xs text-slate-400 mt-1" style={{ fontFamily: "var(--font-body)" }}>Bawa bukti invoice saat pengambilan</p>
                <p className="mt-2 text-xs font-semibold text-slate-600" style={{ fontFamily: "var(--font-body)" }}>Ongkir: Rp 0</p>
              </div>
            )}

            {/* Price summary */}
            <div className="mb-4 rounded-lg border border-sky-100 bg-slate-50 p-4 space-y-1.5">
              <div className="flex justify-between text-sm text-slate-500" style={{ fontFamily: "var(--font-body)" }}>
                <span>Harga Sepatu</span>
                <span className="tabular-nums">{formatIDR(basePrice)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-500" style={{ fontFamily: "var(--font-body)" }}>
                <span>Ongkir</span>
                <span className="tabular-nums">{formatIDR(shippingCost)}</span>
              </div>
              <div className="h-px bg-sky-100 my-1" />
              <div className="flex justify-between text-base font-bold text-slate-900" style={{ fontFamily: "var(--font-body)" }}>
                <span>TOTAL</span>
                <span className="tabular-nums text-blue-600">{formatIDR(totalPrice)}</span>
              </div>
            </div>

            {/* Error */}
            {checkoutError && (
              <p className="mb-3 text-sm text-red-600 font-semibold" style={{ fontFamily: "var(--font-body)" }}>{checkoutError}</p>
            )}

            {/* Submit */}
            <button
              id="checkout-submit-btn"
              onClick={handleCheckoutSubmit}
              disabled={checkoutLoading}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold uppercase tracking-widest text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 shadow-md shadow-blue-600/10"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {checkoutLoading ? "Memproses Pembayaran..." : "Bayar Sekarang"}
            </button>
          </motion.div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          RECEIPT MODAL
      ══════════════════════════════════════════════════════════════════════════ */}
      {receiptOpen && receiptOrder && (
        <div className="receipt-print-root fixed inset-0 z-50">
          <div className="no-print absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <div className="relative z-10 flex h-full items-center justify-center p-4">
          {/* The receipt card itself gets receipt-modal for print targeting */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="receipt-modal relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-slate-200/50 bg-slate-50 p-6 shadow-xl shadow-slate-300/70"
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
          >
            {/* Close button — no-print */}
            <button
              onClick={() => setReceiptOpen(false)}
              className="no-print absolute right-3 top-3 text-slate-400 hover:text-slate-900 text-xl leading-none"
            >
              ×
            </button>

            {/* Receipt header */}
            <div className="mb-4 text-center">
              <div className="flex justify-center mb-2">
                <Image src="/images/logo-tebeeesport-v3.png" alt="Logo" width={100} height={30} className="object-contain" />
              </div>
              <p className="text-xs text-slate-400">Athletic Footwear &amp; Apparel</p>
              <p className="text-xs text-slate-500">Depok, Jawa Barat</p>
            </div>

            <div className="mb-3 border-t border-dashed border-sky-200 pt-3 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Invoice</span>
                <span className="text-right text-[10px]">{receiptOrder.invoiceNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tanggal</span>
                <span>{formatDate(receiptOrder.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Reseller</span>
                <span>{user?.name ?? receiptOrder.customerName}</span>
              </div>
            </div>

            <div className="mb-3 border-t border-dashed border-sky-200 pt-3">
              <p className="mb-2 text-xs font-bold tracking-widest text-slate-400">DETAIL PESANAN</p>
              <p className="text-xs text-slate-900 font-semibold">{receiptOrder.variant.product.name}</p>
              <p className="text-xs text-slate-400">
                Size {receiptOrder.variant.size} × {receiptOrder.quantity} @ {formatIDR(receiptOrder.totalPrice - receiptOrder.shippingCost)}
              </p>
              <div className="mt-1 flex justify-between text-xs">
                <span className="text-slate-400">Subtotal</span>
                <span className="text-slate-955">{formatIDR(receiptOrder.totalPrice - receiptOrder.shippingCost)}</span>
              </div>
            </div>

            <div className="mb-3 border-t border-dashed border-sky-200 pt-3 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Metode</span>
                <span className="text-green-600 font-bold">DIRECT PAYMENT (LUNAS)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Via</span>
                <span>QRIS / Virtual Account</span>
              </div>
            </div>

            <div className="mb-3 border-t border-dashed border-sky-200 pt-3 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Pengiriman</span>
                <span className="font-bold">{receiptOrder.fulfillmentMethod}</span>
              </div>
              {receiptOrder.fulfillmentMethod === "SHIPPING" && receiptOrder.shippingAddress && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Kepada</span>
                    <span className="text-right max-w-[55%] break-words">{receiptOrder.shippingAddress.recipientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Kota</span>
                    <span>{receiptOrder.shippingAddress.city}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Alamat</span>
                    <span className="text-right max-w-[55%] break-words">{receiptOrder.shippingAddress.address}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Ongkir JNE REG</span>
                <span>{formatIDR(receiptOrder.shippingCost)}</span>
              </div>
            </div>

            {/* Total */}
            <div className="mb-3 border-t-2 border-slate-300 pt-3">
              <div className="flex justify-between text-sm font-bold">
                <span className="text-slate-900">TOTAL BAYAR</span>
                <span className="text-blue-600 tabular-nums">{formatIDR(receiptOrder.totalPrice)}</span>
              </div>
            </div>

            <div className="mb-4 border-t border-dashed border-sky-200 pt-3 text-center text-xs font-bold text-green-600 bg-green-50/50 py-1.5 rounded border border-green-200">
              LUNAS / PAID
            </div>

            {/* QR section */}
            <div className="border-t border-dashed border-sky-200 pt-4 text-center">
              <p className="mb-3 text-xs font-bold tracking-widest text-slate-400">BARCODE KEAMANAN</p>
              <div className="flex justify-center mb-3">
                <QRCodeSVG
                  value={receiptOrder.secureBarcodeToken}
                  size={120}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  className="print:block"
                />
              </div>
              <p className="mb-2 break-all text-[10px] text-slate-400">{receiptOrder.secureBarcodeToken}</p>
              <p className="text-xs text-slate-400">Tunjukkan QR ini saat pengambilan barang</p>
            </div>

            {/* Action buttons */}
            <div className="no-print mt-5 flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-600/40 hover:text-blue-600 shadow-sm"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Cetak / Simpan PDF
              </button>
              <button
                onClick={() => setReceiptOpen(false)}
                className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white transition hover:bg-blue-700 shadow-sm hover:shadow-blue-600/20"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Tutup
              </button>
            </div>
          </motion.div>
          </div>
        </div>
      )}

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && user && (
        <div className="no-print fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm sm:hidden">
          <div className="absolute inset-0" onClick={() => setMobileMenuOpen(false)} />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            transition={{ type: "tween", duration: 0.3 }}
            className="relative w-64 h-full bg-white p-6 shadow-2xl flex flex-col gap-6"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <span className="text-sm font-bold uppercase tracking-wider text-slate-900">Menu Navigasi</span>
              <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-slate-900 text-lg">×</button>
            </div>
            
            {isReseller && (
              <div className="rounded-xl bg-slate-50 border border-slate-200/50 px-4 py-2.5 text-xs font-semibold text-slate-600">
                RESELLER · {user.name}
              </div>
            )}
            
            {isAdmin && (
              <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                <button className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-blue-600 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-blue-600 hover:bg-blue-600 hover:text-white transition">
                  Buka Panel Admin
                </button>
              </Link>
            )}
            
            <button
              onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
              className="w-full mt-auto flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-500 hover:border-red-600/40 hover:text-red-600 transition"
            >
              Keluar
            </button>
          </motion.div>
        </div>
      )}

      {/* ══ TOAST ══════════════════════════════════════════════════════════════ */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`no-print fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border p-4 shadow-xl ${
            toast.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
          style={{ fontFamily: "var(--font-body)", maxWidth: "22rem" }}
        >
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}
    </>
  );
}
