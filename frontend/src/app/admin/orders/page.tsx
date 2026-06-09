"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

/* ─── Types ──────────────────────────────────────────────────────────────────── */
interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "RESELLER" | "CUSTOMER";
  points: number;
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

interface ScanResult {
  success: boolean;
  message: string;
  orderId?: string;
}

type ActiveTab = "PAID" | "SHIPPED" | "COMPLETED";

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);

/* ─── Table class constants ──────────────────────────────────────────────────── */
const thClass = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500";
const tdClass = "px-4 py-3 text-sm text-slate-600";
const trClass = "border-b border-slate-100 bg-white transition-colors hover:bg-slate-50";

/* ─── Skeleton rows ──────────────────────────────────────────────────────────── */
function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <tr key={i} className="animate-pulse border-b border-slate-100">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <div className="h-4 rounded bg-slate-100" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* ─── Empty row ──────────────────────────────────────────────────────────────── */
function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center text-sm text-slate-400" style={{ fontFamily: "var(--font-body)" }}>
        Tidak ada pesanan di kategori ini
      </td>
    </tr>
  );
}

/* ─── Fulfillment pill ───────────────────────────────────────────────────────── */
function MethodBadge({ method }: { method: "SHIPPING" | "PICKUP" }) {
  return method === "SHIPPING" ? (
    <span className="inline-flex rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-600" style={{ fontFamily: "var(--font-body)" }}>
      Kirim
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700" style={{ fontFamily: "var(--font-body)" }}>
      Ambil Toko
    </span>
  );
}

/* ─── Keyframe styles ────────────────────────────────────────────────────────── */
const GLOW_CSS = `
@keyframes redglow {
  0%, 100% { box-shadow: 0 0 8px rgba(239, 68, 68, 0.2); }
  50%       { box-shadow: 0 0 16px rgba(239, 68, 68, 0.4); }
}
@keyframes scaleIn {
  from { transform: scale(0.7); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
.anim-scaleIn { animation: scaleIn 0.25s ease-out; }
.anim-redglow { animation: redglow 1.2s ease-in-out infinite; }
`;

/* ═══════════════════════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════════════════════ */
export default function AdminOrdersPage() {
  const router = useRouter();

  /* ── State ────────────────────────────────────────────────────────────────── */
  const [user, setUser]                     = useState<AuthUser | null>(null);
  const [orders, setOrders]                 = useState<Order[]>([]);
  const [loading, setLoading]               = useState(true);
  const [activeTab, setActiveTab]           = useState<ActiveTab>("PAID");
  const [actionLoading, setActionLoading]   = useState<string | null>(null);
  const [resiInputs, setResiInputs]         = useState<Record<string, string>>({});
  const [scanToken, setScanToken]           = useState("");
  const [scanLoading, setScanLoading]       = useState(false);
  const [scanResult, setScanResult]         = useState<ScanResult | null>(null);
  const [toast, setToast]                   = useState<Toast | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /* ── Auth guard ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tebeee_user");
      if (!raw) { router.push("/"); return; }
      const parsed: AuthUser = JSON.parse(raw);
      if (!parsed?.id || parsed.role !== "ADMIN") { router.push("/"); return; }
      setUser(parsed);
    } catch {
      router.push("/");
    }
  }, [router]);

  /* ── Fetch orders ─────────────────────────────────────────────────────────── */
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("http://127.0.0.1:8000/api/orders?role=ADMIN", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const json = await res.json();
      if (json.success) setOrders(json.orders ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchOrders();
  }, [user, fetchOrders]);

  /* ── Toast auto-dismiss ───────────────────────────────────────────────────── */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Update status ────────────────────────────────────────────────────────── */
  const updateStatus = async (orderId: string, status: string, resiNo?: string) => {
    setActionLoading(orderId);
    try {
      const body: Record<string, string> = { status };
      if (resiNo) body.resiNo = resiNo.trim();

      const res  = await fetch(`http://127.0.0.1:8000/api/orders/${orderId}/status`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body:    JSON.stringify(body),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setToast({ message: `Status berhasil diubah ke ${status}`, type: "success" });
        setResiInputs((prev) => { const n = { ...prev }; delete n[orderId]; return n; });
        await fetchOrders();
      } else {
        setToast({ message: json.message ?? "Gagal mengubah status", type: "error" });
      }
    } catch {
      setToast({ message: "Server tidak dapat dijangkau", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  /* ── Barcode scan ─────────────────────────────────────────────────────────── */
  const handleBarcodeScan = async () => {
    const token = scanToken.trim();
    if (!token) return;

    setScanLoading(true);
    setScanResult(null);

    try {
      const res  = await fetch("http://127.0.0.1:8000/api/orders/scan-pickup", {
        method:  "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body:    JSON.stringify({ secureBarcodeToken: token }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setScanResult({ success: true, message: "Invoice Valid. Barang Berhasil Diserahkan!", orderId: json.order?.id });
        setScanToken("");
        await fetchOrders();
      } else if (res.status === 403) {
        setScanResult({ success: false, message: "AKSES DITOLAK! Invoice ini sudah pernah digunakan atau diambil!" });
      } else {
        setScanResult({ success: false, message: json.message ?? "Scan gagal" });
      }
    } catch {
      setScanResult({ success: false, message: "Server tidak dapat dijangkau" });
    } finally {
      setScanLoading(false);
    }
  };

  /* ── Tab filters ──────────────────────────────────────────────────────────── */
  const paidOrders      = orders.filter((o) => o.status === "PAID");
  const processingShip  = orders.filter((o) => o.status === "PROCESSING" && o.fulfillmentMethod === "SHIPPING");
  const shippedOrders   = orders.filter((o) => o.status === "SHIPPED");
  const completedOrders = orders.filter((o) => ["COMPLETED", "CANCELLED"].includes(o.status));

  const tabs: { key: ActiveTab; label: string; count: number }[] = [
    { key: "PAID",      label: "PERLU DIPACKING (PAID)",     count: paidOrders.length                          },
    { key: "SHIPPED",   label: "DALAM PENGIRIMAN",           count: processingShip.length + shippedOrders.length },
    { key: "COMPLETED", label: "SELESAI & ARSIP",            count: completedOrders.length                     },
  ];

  /* ═════════════════════════════════════════════════════════════════════════════
     RENDER
  ═════════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-600">
      <style dangerouslySetInnerHTML={{ __html: GLOW_CSS }} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-900 shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3 gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 transition-all hover:border-slate-500 hover:text-white"
              aria-label="Kembali ke panel admin"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold uppercase tracking-widest text-white sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
                OMS — <span className="text-blue-500">MANAJEMEN PESANAN</span>
              </h1>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-slate-300" style={{ fontFamily: "var(--font-body)" }}>
                <Image src="/images/logo-tebeeesport-v3.png" alt="Logo" width={50} height={20} className="h-4 w-auto object-contain" />
                <span>— Panel Admin OMS</span>
              </div>
            </div>
          </div>
          {/* Mobile Menu Burger Button */}
          {user && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex sm:hidden ml-auto items-center justify-center p-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              aria-label="Menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">

        {/* ── Summary cards ─────────────────────────────────────────────────── */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-2xl border p-4 text-left transition-all duration-200 shadow-xl ${
                activeTab === tab.key
                  ? "border-blue-500/60 bg-blue-50/50 shadow-blue-100/50"
                  : "border-slate-200/50 bg-white shadow-slate-300/40"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400" style={{ fontFamily: "var(--font-body)" }}>
                {tab.label}
              </p>
              <p className={`mt-1 text-3xl font-bold ${activeTab === tab.key ? "text-blue-600" : "text-slate-900"}`} style={{ fontFamily: "var(--font-display)" }}>
                {tab.count}
              </p>
            </button>
          ))}
        </div>

        {/* ── Security scanner ──────────────────────────────────────────────── */}
        <div className="mb-6 rounded-2xl border border-slate-200/50 bg-white p-5 shadow-xl shadow-slate-300/70">
          <p className="mb-0.5 text-base font-bold uppercase tracking-widest text-blue-600" style={{ fontFamily: "var(--font-display)" }}>
            SCAN BARCODE PENGAMBILAN
          </p>
          <p className="mb-4 text-xs text-slate-400" style={{ fontFamily: "var(--font-body)" }}>
            Input token dari invoice reseller (simulasi scanner laser)
          </p>

          <div className="flex">
            <input
              id="scan-token-input"
              type="text"
              value={scanToken}
              onChange={(e) => setScanToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBarcodeScan()}
              placeholder="Scan atau ketik secureBarcodeToken..."
              className="flex-1 rounded-l-xl border border-r-0 border-slate-200 bg-white px-4 py-2.5 font-mono text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500"
            />
            <button
              id="scan-submit-btn"
              onClick={handleBarcodeScan}
              disabled={scanLoading || !scanToken.trim()}
              className="rounded-r-xl bg-blue-600 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {scanLoading ? "..." : "SCAN"}
            </button>
          </div>

          {/* Scan result */}
          {scanResult !== null && (
            scanResult.success ? (
              <div className="anim-scaleIn mt-3 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-green-700">
                <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-body)" }}>{scanResult.message}</span>
              </div>
            ) : (
              <div
                className="anim-redglow mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-600"
              >
                <span className="text-sm font-bold uppercase tracking-wide" style={{ fontFamily: "var(--font-body)" }}>
                  {scanResult.message}
                </span>
              </div>
            )
          )}
        </div>

        {/* ── Tab bar ───────────────────────────────────────────────────────── */}
        <div className="mb-6 flex border-b border-sky-100">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-xs font-bold uppercase tracking-widest transition-all duration-200 ${
                activeTab === tab.key
                  ? "border-b-2 border-blue-600 text-slate-900"
                  : "border-b-2 border-transparent text-slate-400 hover:text-slate-600"
              }`}
              style={{ fontFamily: "var(--font-body)" }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  activeTab === tab.key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            TAB 1: PAID — Need packing
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "PAID" && (
          <div className="space-y-4">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200/50 shadow-xl shadow-slate-300/70 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-sky-100 bg-slate-50">
                      {["Invoice", "Produk", "Size", "Qty", "Total", "Metode", "Reseller", "Aksi"].map((h) => (
                        <th key={h} className={thClass} style={{ fontFamily: "var(--font-body)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <SkeletonRows cols={8} />
                    ) : paidOrders.length === 0 ? (
                      <EmptyRow colSpan={8} />
                    ) : paidOrders.map((order) => {
                      const busy = actionLoading === order.id;
                      return (
                        <tr key={order.id} className={trClass}>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{order.invoiceNo}</td>
                          <td className={`${tdClass} font-semibold text-slate-900`} style={{ fontFamily: "var(--font-body)" }}>{order.variant.product.name}</td>
                          <td className="px-4 py-3 text-base font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>{order.variant.size}</td>
                          <td className={tdClass} style={{ fontFamily: "var(--font-body)" }}>{order.quantity}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums" style={{ fontFamily: "var(--font-body)" }}>{formatIDR(order.totalPrice)}</td>
                          <td className="px-4 py-3"><MethodBadge method={order.fulfillmentMethod} /></td>
                          <td className={tdClass} style={{ fontFamily: "var(--font-body)" }}>
                            <span className="block text-xs font-semibold text-slate-900">{order.reseller?.name ?? "—"}</span>
                            <span className="block text-[11px] text-slate-400">{order.reseller?.email ?? ""}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <button
                                 type="button"
                                 disabled={busy}
                                 onClick={() => updateStatus(order.id, "PROCESSING")}
                                 className={`rounded-xl bg-blue-600 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-blue-700 active:scale-95 shadow-sm hover:shadow-blue-600/20 ${busy ? "cursor-not-allowed opacity-40" : ""}`}
                                 style={{ fontFamily: "var(--font-body)" }}
                              >
                                 {order.fulfillmentMethod === "PICKUP" ? "Tandai Siap" : "Packing"}
                              </button>
                              <button
                                 type="button"
                                 disabled={busy}
                                 onClick={() => updateStatus(order.id, "CANCELLED")}
                                 className={`rounded-xl bg-red-600 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-red-700 active:scale-95 shadow-sm ${busy ? "cursor-not-allowed opacity-40" : ""}`}
                                 style={{ fontFamily: "var(--font-body)" }}
                              >
                                 Tolak
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Stack Card View */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse rounded-2xl border border-slate-200/50 bg-white p-4 shadow-md h-36" />
                  ))}
                </div>
              ) : paidOrders.length === 0 ? (
                <div className="rounded-2xl border border-slate-200/50 bg-white py-12 text-center text-sm text-slate-400" style={{ fontFamily: "var(--font-body)" }}>
                  Tidak ada pesanan di kategori ini
                </div>
              ) : (
                paidOrders.map((order) => {
                  const busy = actionLoading === order.id;
                  return (
                    <div key={order.id} className="rounded-2xl border border-slate-200/50 bg-white p-4 shadow-xl shadow-slate-300/40 flex flex-col gap-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="font-mono text-xs font-semibold text-slate-500">{order.invoiceNo}</span>
                        <MethodBadge method={order.fulfillmentMethod} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm" style={{ fontFamily: "var(--font-body)" }}>{order.variant.product.name}</h4>
                        <div className="mt-1 flex items-center justify-between text-xs text-slate-500" style={{ fontFamily: "var(--font-body)" }}>
                          <span>Ukuran: <strong className="text-slate-900 font-bold" style={{ fontFamily: "var(--font-display)" }}>{order.variant.size}</strong></span>
                          <span>Jumlah: <strong className="text-slate-900 font-bold">{order.quantity}</strong></span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center bg-slate-50/50 px-3 py-2 rounded-xl text-xs" style={{ fontFamily: "var(--font-body)" }}>
                        <span className="text-slate-400">Total Harga</span>
                        <span className="font-bold text-slate-950">{formatIDR(order.totalPrice)}</span>
                      </div>
                      <div className="text-xs border-t border-slate-100 pt-2" style={{ fontFamily: "var(--font-body)" }}>
                        <span className="block font-semibold text-slate-950">Reseller: {order.reseller?.name ?? "—"}</span>
                        <span className="block text-slate-400">{order.reseller?.email ?? ""}</span>
                      </div>
                      <div className="flex gap-2 mt-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => updateStatus(order.id, "PROCESSING")}
                          className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white transition hover:bg-blue-700 active:scale-95 disabled:opacity-40"
                          style={{ fontFamily: "var(--font-body)" }}
                        >
                          {order.fulfillmentMethod === "PICKUP" ? "Tandai Siap" : "Packing"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => updateStatus(order.id, "CANCELLED")}
                          className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700 active:scale-95 disabled:opacity-40"
                          style={{ fontFamily: "var(--font-body)" }}
                        >
                          Tolak
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB 2: SHIPPED — In transit + PROCESSING needing resi
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "SHIPPED" && (
          <div className="space-y-6">
            {/* PROCESSING orders needing resi */}
            {processingShip.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-600" style={{ fontFamily: "var(--font-body)" }}>
                  Input No. Resi — Siap Kirim
                </p>

                {/* Desktop View */}
                <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200/50 shadow-xl shadow-slate-300/70 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-sky-100 bg-slate-50">
                          {["Invoice", "Produk", "Size", "Qty", "Total", "Reseller", "Input Resi", "Aksi"].map((h) => (
                            <th key={h} className={thClass} style={{ fontFamily: "var(--font-body)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {processingShip.map((order) => {
                          const busy      = actionLoading === order.id;
                          const resiValue = resiInputs[order.id] ?? "";
                          const canShip   = resiValue.trim().length > 0;
                          return (
                            <tr key={order.id} className={trClass}>
                              <td className="px-4 py-3 font-mono text-xs text-slate-500">{order.invoiceNo}</td>
                              <td className={`${tdClass} font-semibold text-slate-900`} style={{ fontFamily: "var(--font-body)" }}>{order.variant.product.name}</td>
                              <td className="px-4 py-3 text-base font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>{order.variant.size}</td>
                              <td className={tdClass} style={{ fontFamily: "var(--font-body)" }}>{order.quantity}</td>
                              <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums" style={{ fontFamily: "var(--font-body)" }}>{formatIDR(order.totalPrice)}</td>
                              <td className={tdClass} style={{ fontFamily: "var(--font-body)" }}>
                                <span className="block text-xs font-semibold text-slate-900">{order.reseller?.name ?? "—"}</span>
                                <span className="block text-[11px] text-slate-400">{order.reseller?.email ?? ""}</span>
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  placeholder="JNE123456..."
                                  value={resiValue}
                                  onChange={(e) =>
                                    setResiInputs((prev) => ({ ...prev, [order.id]: e.target.value }))
                                  }
                                  disabled={busy}
                                  className="w-36 rounded-xl border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 disabled:opacity-50"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  disabled={busy || !canShip}
                                  onClick={() => updateStatus(order.id, "SHIPPED", resiValue)}
                                  className={`rounded-xl px-3 py-1 text-xs font-bold text-white transition ${
                                    busy || !canShip
                                      ? "cursor-not-allowed bg-blue-600 opacity-40"
                                      : "bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-sm"
                                  }`}
                                  style={{ fontFamily: "var(--font-body)" }}
                                >
                                  Kirim Barang
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile View */}
                <div className="grid grid-cols-1 gap-4 md:hidden">
                  {processingShip.map((order) => {
                    const busy      = actionLoading === order.id;
                    const resiValue = resiInputs[order.id] ?? "";
                    const canShip   = resiValue.trim().length > 0;
                    return (
                      <div key={order.id} className="rounded-2xl border border-slate-200/50 bg-white p-4 shadow-xl shadow-slate-300/40 flex flex-col gap-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="font-mono text-xs font-semibold text-slate-500">{order.invoiceNo}</span>
                          <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-600" style={{ fontFamily: "var(--font-body)" }}>
                            Kirim
                          </span>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-950 text-sm" style={{ fontFamily: "var(--font-body)" }}>{order.variant.product.name}</h4>
                          <div className="mt-1 flex items-center justify-between text-xs text-slate-500" style={{ fontFamily: "var(--font-body)" }}>
                            <span>Ukuran: <strong className="text-slate-900 font-bold" style={{ fontFamily: "var(--font-display)" }}>{order.variant.size}</strong></span>
                            <span>Jumlah: <strong className="text-slate-900 font-bold">{order.quantity}</strong></span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50/50 px-3 py-2 rounded-xl text-xs" style={{ fontFamily: "var(--font-body)" }}>
                          <span className="text-slate-400">Total Harga</span>
                          <span className="font-bold text-slate-950">{formatIDR(order.totalPrice)}</span>
                        </div>
                        <div className="text-xs border-t border-slate-100 pt-2" style={{ fontFamily: "var(--font-body)" }}>
                          <span className="block font-semibold text-slate-950">Reseller: {order.reseller?.name ?? "—"}</span>
                          <span className="block text-slate-400">{order.reseller?.email ?? ""}</span>
                        </div>
                        <div className="flex flex-col gap-2 mt-1">
                          <input
                            type="text"
                            placeholder="Input No. Resi (JNE123...)"
                            value={resiValue}
                            onChange={(e) =>
                              setResiInputs((prev) => ({ ...prev, [order.id]: e.target.value }))
                            }
                            disabled={busy}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 disabled:opacity-50"
                          />
                          <button
                            type="button"
                            disabled={busy || !canShip}
                            onClick={() => updateStatus(order.id, "SHIPPED", resiValue)}
                            className="w-full rounded-xl bg-blue-600 py-2 text-xs font-bold text-white transition hover:bg-blue-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ fontFamily: "var(--font-body)" }}
                          >
                            Kirim Barang
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SHIPPED orders */}
            <div>
              {processingShip.length > 0 && (
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400" style={{ fontFamily: "var(--font-body)" }}>
                  Sudah Dikirim — Konfirmasi Penerimaan
                </p>
              )}

              {/* Desktop View */}
              <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200/50 shadow-xl shadow-slate-300/70 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-sky-100 bg-slate-50">
                        {["Invoice", "Produk", "Size", "Qty", "Total", "Reseller", "No. Resi", "Aksi"].map((h) => (
                          <th key={h} className={thClass} style={{ fontFamily: "var(--font-body)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <SkeletonRows cols={8} />
                      ) : shippedOrders.length === 0 ? (
                        <EmptyRow colSpan={8} />
                      ) : shippedOrders.map((order) => {
                        const busy = actionLoading === order.id;
                        return (
                          <tr key={order.id} className={trClass}>
                            <td className="px-4 py-3 font-mono text-xs text-slate-500">{order.invoiceNo}</td>
                            <td className={`${tdClass} font-semibold text-slate-900`} style={{ fontFamily: "var(--font-body)" }}>{order.variant.product.name}</td>
                            <td className="px-4 py-3 text-base font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>{order.variant.size}</td>
                            <td className={tdClass} style={{ fontFamily: "var(--font-body)" }}>{order.quantity}</td>
                            <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums" style={{ fontFamily: "var(--font-body)" }}>{formatIDR(order.totalPrice)}</td>
                            <td className={tdClass} style={{ fontFamily: "var(--font-body)" }}>
                              <span className="block text-xs font-semibold text-slate-900">{order.reseller?.name ?? "—"}</span>
                              <span className="block text-[11px] text-slate-400">{order.reseller?.email ?? ""}</span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-emerald-600 font-semibold">{order.resiNo ?? "—"}</td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => updateStatus(order.id, "COMPLETED")}
                                className={`rounded-xl bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-emerald-700 active:scale-95 shadow-sm ${busy ? "cursor-not-allowed opacity-40" : ""}`}
                                style={{ fontFamily: "var(--font-body)" }}
                              >
                                Konfirmasi Terima
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile View */}
              <div className="grid grid-cols-1 gap-4 md:hidden">
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse rounded-2xl border border-slate-200/50 bg-white p-4 shadow-md h-36" />
                    ))}
                  </div>
                ) : shippedOrders.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200/50 bg-white py-12 text-center text-sm text-slate-400" style={{ fontFamily: "var(--font-body)" }}>
                    Tidak ada pesanan di kategori ini
                  </div>
                ) : (
                  shippedOrders.map((order) => {
                    const busy = actionLoading === order.id;
                    return (
                      <div key={order.id} className="rounded-2xl border border-slate-200/50 bg-white p-4 shadow-xl shadow-slate-300/40 flex flex-col gap-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="font-mono text-xs font-semibold text-slate-500">{order.invoiceNo}</span>
                          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-600" style={{ fontFamily: "var(--font-body)" }}>
                            Dikirim
                          </span>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm" style={{ fontFamily: "var(--font-body)" }}>{order.variant.product.name}</h4>
                          <div className="mt-1 flex items-center justify-between text-xs text-slate-500" style={{ fontFamily: "var(--font-body)" }}>
                            <span>Ukuran: <strong className="text-slate-900 font-bold" style={{ fontFamily: "var(--font-display)" }}>{order.variant.size}</strong></span>
                            <span>Jumlah: <strong className="text-slate-900 font-bold">{order.quantity}</strong></span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50/50 px-3 py-2 rounded-xl text-xs" style={{ fontFamily: "var(--font-body)" }}>
                          <span className="text-slate-400">Total Harga</span>
                          <span className="font-bold text-slate-950">{formatIDR(order.totalPrice)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-emerald-50/20 px-3 py-2 rounded-xl text-xs font-mono" style={{ fontFamily: "var(--font-body)" }}>
                          <span className="text-slate-400 font-sans">No. Resi</span>
                          <span className="font-bold text-emerald-600">{order.resiNo ?? "—"}</span>
                        </div>
                        <div className="text-xs border-t border-slate-100 pt-2" style={{ fontFamily: "var(--font-body)" }}>
                          <span className="block font-semibold text-slate-950">Reseller: {order.reseller?.name ?? "—"}</span>
                          <span className="block text-slate-400">{order.reseller?.email ?? ""}</span>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => updateStatus(order.id, "COMPLETED")}
                          className="w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 active:scale-95 disabled:opacity-40 shadow-sm"
                          style={{ fontFamily: "var(--font-body)" }}
                        >
                          Konfirmasi Terima
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB 3: COMPLETED & CANCELLED — Archive
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "COMPLETED" && (
          <div className="space-y-4">
            {/* Desktop View */}
            <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200/50 shadow-xl shadow-slate-300/70 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-sky-100 bg-slate-50">
                      {["Invoice", "Produk", "Size", "Total", "Metode", "Reseller", "Status", "Resi"].map((h) => (
                        <th key={h} className={thClass} style={{ fontFamily: "var(--font-body)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <SkeletonRows cols={8} />
                    ) : completedOrders.length === 0 ? (
                      <EmptyRow colSpan={8} />
                    ) : completedOrders.map((order) => (
                      <tr key={order.id} className={trClass}>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{order.invoiceNo}</td>
                        <td className={`${tdClass} font-semibold text-slate-900`} style={{ fontFamily: "var(--font-body)" }}>{order.variant.product.name}</td>
                        <td className="px-4 py-3 text-base font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>{order.variant.size}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums" style={{ fontFamily: "var(--font-body)" }}>{formatIDR(order.totalPrice)}</td>
                        <td className="px-4 py-3"><MethodBadge method={order.fulfillmentMethod} /></td>
                        <td className={tdClass} style={{ fontFamily: "var(--font-body)" }}>
                          <span className="block text-xs font-semibold text-slate-900">{order.reseller?.name ?? "—"}</span>
                          <span className="block text-[11px] text-slate-400">{order.reseller?.email ?? ""}</span>
                        </td>
                        <td className="px-4 py-3">
                          {order.status === "COMPLETED" ? (
                            <span className="inline-flex rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-bold text-green-600" style={{ fontFamily: "var(--font-body)" }}>
                              Selesai
                            </span>
                          ) : (
                            <span className="inline-flex rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600" style={{ fontFamily: "var(--font-body)" }}>
                              Dibatalkan
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-emerald-600 font-semibold">
                          {order.resiNo ?? <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile View */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse rounded-2xl border border-slate-200/50 bg-white p-4 shadow-md h-36" />
                  ))}
                </div>
              ) : completedOrders.length === 0 ? (
                <div className="rounded-2xl border border-slate-200/50 bg-white py-12 text-center text-sm text-slate-400" style={{ fontFamily: "var(--font-body)" }}>
                  Tidak ada pesanan di kategori ini
                </div>
              ) : (
                completedOrders.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-slate-200/50 bg-white p-4 shadow-xl shadow-slate-300/40 flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-mono text-xs font-semibold text-slate-500">{order.invoiceNo}</span>
                      <MethodBadge method={order.fulfillmentMethod} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm" style={{ fontFamily: "var(--font-body)" }}>{order.variant.product.name}</h4>
                      <div className="mt-1 flex items-center justify-between text-xs text-slate-500" style={{ fontFamily: "var(--font-body)" }}>
                        <span>Ukuran: <strong className="text-slate-900 font-bold" style={{ fontFamily: "var(--font-display)" }}>{order.variant.size}</strong></span>
                        <span>Jumlah: <strong className="text-slate-900 font-bold">{order.quantity}</strong></span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center bg-slate-50/50 px-3 py-2 rounded-xl text-xs" style={{ fontFamily: "var(--font-body)" }}>
                      <span className="text-slate-400">Total Harga</span>
                      <span className="font-bold text-slate-950">{formatIDR(order.totalPrice)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-50/50 px-3 py-2 rounded-xl text-xs" style={{ fontFamily: "var(--font-body)" }}>
                      <span className="text-slate-400">Status</span>
                      {order.status === "COMPLETED" ? (
                        <span className="inline-flex rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-bold text-green-600" style={{ fontFamily: "var(--font-body)" }}>
                          Selesai
                        </span>
                      ) : (
                        <span className="inline-flex rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600" style={{ fontFamily: "var(--font-body)" }}>
                          Dibatalkan
                        </span>
                      )}
                    </div>
                    {order.resiNo && (
                      <div className="flex justify-between items-center bg-emerald-50/20 px-3 py-2 rounded-xl text-xs font-mono" style={{ fontFamily: "var(--font-body)" }}>
                        <span className="text-slate-400 font-sans">No. Resi</span>
                        <span className="font-bold text-emerald-600">{order.resiNo}</span>
                      </div>
                    )}
                    <div className="text-xs border-t border-slate-100 pt-2" style={{ fontFamily: "var(--font-body)" }}>
                      <span className="block font-semibold text-slate-950">Reseller: {order.reseller?.name ?? "—"}</span>
                      <span className="block text-slate-400">{order.reseller?.email ?? ""}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

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
              <span className="text-sm font-bold uppercase tracking-wider text-slate-950">Menu Admin</span>
              <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-slate-900 text-lg">×</button>
            </div>
            
            <Link href="/" onClick={() => setMobileMenuOpen(false)}>
              <button className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition">
                Kembali ke Katalog
              </button>
            </Link>

            <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
              <button className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition">
                Kelola Produk
              </button>
            </Link>

            <Link href="/admin/orders" onClick={() => setMobileMenuOpen(false)}>
              <button className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-blue-600 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-blue-600 hover:bg-blue-50 transition">
                Kelola Pesanan
              </button>
            </Link>
            
            <button
              onClick={() => {
                localStorage.removeItem("tebeee_user");
                router.push("/");
                setMobileMenuOpen(false);
              }}
              className="w-full mt-auto flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-500 hover:border-red-600/40 hover:text-red-600 transition"
            >
              Keluar
            </button>
          </motion.div>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-sky-100 py-6 mt-8 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-slate-400" style={{ fontFamily: "var(--font-body)" }}>
            <span>© {new Date().getFullYear()}</span>
            <Image src="/images/logo-tebeeesport-v3.png" alt="Logo" width={50} height={15} className="h-3 w-auto object-contain" />
            <span>— Order Management System. All rights reserved.</span>
          </div>
        </div>
      </footer>

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border p-4 shadow-xl ${
            toast.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
          style={{ fontFamily: "var(--font-body)", maxWidth: "22rem" }}
        >
          <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-body)" }}>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
