"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const NODE_BASE = "http://localhost:3001";
const LARAVEL_BASE = "http://127.0.0.1:8000";
const CATEGORIES = ["Running", "Crocs", "Apparel"] as const;
const SIZES = ["39", "40", "41", "42"] as const;

/* ─── Types ──────────────────────────────────────────────────────────────────── */
interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "RESELLER" | "CUSTOMER";
  points: number;
}

interface VariantInput {
  id?: string;
  size: string;
  stock: number;
  price: number;
}

interface ProductFull {
  id: string;
  name: string;
  category: string;
  description?: string;
  imageUrl?: string;
  variants: VariantInput[];
}

interface Toast {
  message: string;
  type: "success" | "error";
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);

const INITIAL_VARIANTS: VariantInput[] = [
  { size: "", stock: 0, price: 450000 }
];

const INITIAL_FORM = {
  name: "",
  category: "Running" as string,
  description: "",
  variants: INITIAL_VARIANTS,
};

function buildFormData(
  data: typeof INITIAL_FORM,
  file: File | null
): FormData {
  const fd = new FormData();
  fd.append("name", data.name);
  fd.append("category", data.category);
  fd.append("description", data.description);
  const filteredVariants = data.variants
    .filter((v) => v.size.trim() !== "")
    .map((v) => ({
      size: v.size.trim(),
      stock: Math.max(0, Number(v.stock)),
      price: Math.max(0, Number(v.price)),
    }));
  fd.append("variants", JSON.stringify(filteredVariants));
  if (file) fd.append("image", file);
  return fd;
}

/* ─── Spinner SVG ────────────────────────────────────────────────────────────── */
function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ─── Image src resolver ─────────────────────────────────────────────────────── */
function resolveImageSrc(url?: string): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${NODE_BASE}${url}`;
}

/* ─── Page ───────────────────────────────────────────────────────────────────── */
export default function AdminPage() {
  const router = useRouter();

  /* ── Auth ─────────────────────────────────────────────────────────────────── */
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /* ── Products list ────────────────────────────────────────────────────────── */
  const [products, setProducts] = useState<ProductFull[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  /* ── Add form ─────────────────────────────────────────────────────────────── */
  const [form, setForm] = useState(INITIAL_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState(false);

  /* ── Edit modal ───────────────────────────────────────────────────────────── */
  const [editOpen, setEditOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductFull | null>(null);
  const [editForm, setEditForm] = useState(INITIAL_FORM);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  /* ── Toast ────────────────────────────────────────────────────────────────── */
  const [toast, setToast] = useState<Toast | null>(null);

  /* ── Preview URL cleanup refs ─────────────────────────────────────────────── */
  const addPreviewRef = useRef("");
  const editPreviewRef = useRef("");

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

  /* ── Toast auto-dismissal ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  /* ── Fetch products ───────────────────────────────────────────────────────── */
  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await fetch(`${LARAVEL_BASE}/api/products`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        if (Array.isArray(data)) {
          setProducts(data);
        } else if (data && Array.isArray(data.data)) {
          setProducts(data.data);
        }
      }
    } catch (error) {
      console.error("Failed to load products:", error);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  /* ── Load catalog on auth success ─────────────────────────────────────────── */
  useEffect(() => {
    if (user) fetchProducts();
  }, [user, fetchProducts]);

  /* ── Preview URL cleanup ──────────────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (addPreviewRef.current) URL.revokeObjectURL(addPreviewRef.current);
      if (editPreviewRef.current) URL.revokeObjectURL(editPreviewRef.current);
    };
  }, []);

  /* ── Image select handler ─────────────────────────────────────────────────── */
  const handleImageSelect = (file: File, isEdit: boolean) => {
    const ALLOWED = ["image/jpeg", "image/jpg", "image/png"];
    if (!ALLOWED.includes(file.type)) {
      alert("Format file tidak didukung! Hanya .jpg, .jpeg, .png");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran file maksimal 5MB");
      return;
    }

    const url = URL.createObjectURL(file);

    if (isEdit) {
      if (editPreviewRef.current) URL.revokeObjectURL(editPreviewRef.current);
      editPreviewRef.current = url;
      setEditImageFile(file);
      setEditImagePreview(url);
    } else {
      if (addPreviewRef.current) URL.revokeObjectURL(addPreviewRef.current);
      addPreviewRef.current = url;
      setImageFile(file);
      setImagePreview(url);
    }
  };

  /* ── Add product ──────────────────────────────────────────────────────────── */
  const handleAddProduct = async () => {
    setFormError("");

    if (!form.name.trim()) { setFormError("Nama sepatu wajib diisi"); return; }
    if (!form.category) { setFormError("Kategori wajib dipilih"); return; }

    const hasSize = form.variants.some((v) => v.size.trim() !== "");
    if (!hasSize) { setFormError("Minimal satu varian harus memiliki ukuran"); return; }

    const hasPrice = form.variants.some((v) => v.size.trim() !== "" && v.price > 0);
    if (!hasPrice) { setFormError("Minimal satu varian dengan ukuran valid harus memiliki harga > 0"); return; }

    setFormLoading(true);
    try {
      const fd = buildFormData(form, imageFile);
      const res = await fetch(`${LARAVEL_BASE}/api/products`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: fd,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setFormError(data.message ?? "Gagal menyimpan produk");
        return;
      }

      setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 5000);

      // Reset form
      setForm({ name: "", category: "Running", description: "", variants: INITIAL_VARIANTS });
      setImageFile(null);
      setImagePreview("");
      if (addPreviewRef.current) URL.revokeObjectURL(addPreviewRef.current);
      addPreviewRef.current = "";

      await fetchProducts();
      setToast({ message: "Produk berhasil ditambahkan", type: "success" });

    } catch {
      setFormError("Network error: tidak dapat terhubung ke server");
    } finally {
      setFormLoading(false);
    }
  };

  /* ── Open edit modal ──────────────────────────────────────────────────────── */
  const openEditModal = (product: ProductFull) => {
    setEditProduct(product);
    setEditForm({
      name: product.name,
      category: product.category,
      description: product.description ?? "",
      variants: product.variants.map((v) => ({
        id: v.id,
        size: v.size,
        stock: v.stock,
        price: v.price,
      })),
    });
    setEditImageFile(null);
    if (editPreviewRef.current) URL.revokeObjectURL(editPreviewRef.current);
    editPreviewRef.current = "";
    setEditImagePreview(product.imageUrl ? resolveImageSrc(product.imageUrl) : "");
    setEditError("");
    setEditOpen(true);
  };

  /* ── Save edit ────────────────────────────────────────────────────────────── */
  const handleSaveEdit = async () => {
    if (!editProduct) return;

    if (editImageFile && !["image/jpeg", "image/jpg", "image/png"].includes(editImageFile.type)) {
      setEditError("Format file tidak valid! Hanya .jpg, .jpeg, .png");
      return;
    }

    setEditLoading(true);
    setEditError("");

    try {
      const fd = new FormData();
      fd.append("name", editForm.name.trim());
      fd.append("category", editForm.category);
      fd.append("description", editForm.description.trim());

      const validVariants = editForm.variants
        .filter((v) => v.size.trim() !== "")
        .map((v) => ({
          ...(v.id && { id: v.id }),
          size: String(v.size).trim(),
          stock: Math.max(0, Number(v.stock)),
          price: Math.max(0, Number(v.price)),
        }));

      if (validVariants.length === 0) {
        setEditError("Data variant tidak valid: minimal harus ada satu ukuran");
        setEditLoading(false);
        return;
      }

      fd.append("variants", JSON.stringify(validVariants));

      if (editImageFile) {
        fd.append("image", editImageFile, editImageFile.name);
      } else if (editProduct.imageUrl) {
        fd.append("imageUrl", editProduct.imageUrl);
      }

      const res = await fetch(`${LARAVEL_BASE}/api/products/${editProduct.id}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: fd,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setEditError(data.message ?? "Gagal menyimpan perubahan. Coba lagi.");
        return;
      }

      setEditOpen(false);
      setEditProduct(null);
      setEditImageFile(null);
      setEditImagePreview("");
      setEditForm({ name: "", category: "Running", description: "", variants: [] });

      await fetchProducts();
      setToast({ message: "Produk berhasil diperbarui", type: "success" });

    } catch {
      setEditError("Network error: tidak dapat terhubung ke server");
    } finally {
      setEditLoading(false);
    }
  };

  /* ── Delete product ───────────────────────────────────────────────────────── */
  const handleDeleteProduct = async () => {
    if (!editProduct) return;

    setDeleteLoading(true);
    try {
      const res = await fetch(`${LARAVEL_BASE}/api/products/${editProduct.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setEditError(data.message ?? 'Gagal menghapus produk');
        return;
      }

      setEditOpen(false);
      setDeleteConfirmOpen(false);
      setEditProduct(null);
      await fetchProducts();
      setToast({ message: 'Produk berhasil dihapus permanen', type: 'success' });

    } catch {
      setEditError('Network error — tidak dapat menghubungi server');
    } finally {
      setDeleteLoading(false);
    }
  };

  /* ── Render guard ─────────────────────────────────────────────────────────── */
  if (!user) return null;

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-600">

      {/* ══ HEADER ════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-900 shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3 gap-4">
          <Link
            href="/"
            className="flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 transition-all duration-200 hover:border-slate-500 hover:text-white"
            aria-label="Kembali ke katalog"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>

          <div className="flex-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold uppercase tracking-widest text-white sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
                PANEL <span className="text-blue-500">ADMIN</span>
              </h1>
              <span className="hidden rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white sm:inline-flex" style={{ fontFamily: "var(--font-body)" }}>
                MODE ADMIN
              </span>
            </div>
            <div className="mt-0.5 text-xs uppercase tracking-wider text-slate-400 font-medium" style={{ fontFamily: "var(--font-body)" }}>
              tebeee sport — manajemen produk
            </div>
          </div>

          {/* Mobile Menu Burger Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex sm:hidden items-center justify-center p-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            aria-label="Menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </div>
      </header>

      {/* ══ MAIN ══════════════════════════════════════════════════════════════ */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">

        {/* Quick nav: OMS */}
        <Link href="/admin/orders" className="mb-8 flex items-center justify-between rounded-xl border border-sky-100 bg-white px-6 py-4 transition-all duration-200 hover:border-blue-600/60 hover:bg-blue-50/50 shadow-sm shadow-sky-100/50 group">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-all duration-200 group-hover:bg-blue-100">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Kelola Pesanan</p>
              <p className="text-xs text-slate-500" style={{ fontFamily: "var(--font-body)" }}>Order Management System — terima, packing, kirim</p>
            </div>
          </div>
          <svg className="h-5 w-5 text-blue-600 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Link>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 1: PRODUCT LIST
        ════════════════════════════════════════════════════════════════════ */}
        <section className="mb-12">
          <div className="mb-4 flex items-center gap-3">
            <div>
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-[0.25em] text-blue-600" style={{ fontFamily: "var(--font-body)" }}>Inventaris</p>
              <h2 className="text-2xl font-bold uppercase tracking-wide text-slate-900 sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
                PRODUK TERDAFTAR
                {!productsLoading && products.length > 0 && (
                  <span className="ml-3 text-lg text-slate-400">({products.length})</span>
                )}
              </h2>
            </div>
          </div>
          <div className="mb-4 h-0.5 w-12 bg-blue-600" />

          {/* Loading skeleton */}
          {productsLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="animate-pulse rounded-xl border border-sky-100 bg-white">
                  <div className="h-36 rounded-t-xl bg-slate-100" />
                  <div className="p-3 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-slate-100" />
                    <div className="h-3 w-1/2 rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!productsLoading && products.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-sky-200 bg-white py-16 text-center shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 mb-3">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-600" style={{ fontFamily: "var(--font-body)" }}>Belum ada produk</p>
              <p className="text-xs text-slate-400 mt-1" style={{ fontFamily: "var(--font-body)" }}>Tambah produk baru menggunakan form di bawah</p>
            </div>
          )}

          {!productsLoading && products.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {products.map((product) => {
                const minStock = Math.min(...product.variants.map((v) => v.stock));
                const maxStock = Math.max(...product.variants.map((v) => v.stock));
                const imgSrc = resolveImageSrc(product.imageUrl);
                return (
                  <div
                    key={product.id}
                    onClick={() => openEditModal(product)}
                    className="cursor-pointer bg-white border border-sky-100 rounded-xl overflow-hidden shadow-sm shadow-sky-100/40
                               hover:-translate-y-1 hover:shadow-xl hover:border-sky-200/80
                               transition-all duration-300 ease-in-out group"
                  >
                    {/* Image */}
                    <div className="relative h-36 w-full overflow-hidden bg-slate-50">
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={product.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : null}
                      {/* Placeholder shown when no image */}
                      {!imgSrc && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                          <svg viewBox="0 0 120 60" className="w-20 h-10 opacity-20" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M10 45 C10 45 20 20 50 18 C70 16 85 22 95 30 C105 38 108 45 108 45 Z" fill="#2563EB" opacity="0.6" />
                            <path d="M8 45 L112 45 L110 50 Q60 55 10 50 Z" fill="#2563EB" opacity="0.4" />
                            <path d="M50 18 L55 8 L65 10 L60 20" fill="#2563EB" opacity="0.5" />
                          </svg>
                          <span className="text-blue-600/30 text-[10px] font-mono mt-1 tracking-widest">NO IMAGE</span>
                        </div>
                      )}
                      {/* Edit overlay */}
                      <div className="absolute inset-0 bg-white/40 backdrop-blur-sm group-hover:bg-white/60 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg uppercase tracking-widest">Edit</span>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h3 className="font-bold text-slate-900 text-sm leading-tight" style={{ fontFamily: "var(--font-display)" }}>
                          {product.name}
                        </h3>
                        <span className="shrink-0 rounded-full border border-blue-200 text-blue-600 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          {product.category}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500" style={{ fontFamily: "var(--font-body)" }}>
                          {product.variants.length} ukuran · stok {minStock === maxStock ? minStock : `${minStock}–${maxStock}`}
                        </span>
                        <span className="text-xs text-slate-400 group-hover:text-blue-600 transition-colors" style={{ fontFamily: "var(--font-body)" }}>
                          Edit Produk
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 2: ADD PRODUCT FORM
        ════════════════════════════════════════════════════════════════════ */}
        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.25em] text-blue-600" style={{ fontFamily: "var(--font-body)" }}>Tambah Produk</p>
          <h2 className="mb-6 text-2xl font-bold uppercase tracking-wide text-slate-900 sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>FORM PRODUK BARU</h2>
          <div className="mb-6 h-0.5 w-12 bg-blue-600" />

          {/* Success banner */}
          {formSuccess && (
            <div role="status" className="mb-6 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-600" style={{ fontFamily: "var(--font-body)" }}>
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Produk berhasil ditambahkan
            </div>
          )}

          <div className="rounded-2xl border border-slate-200/50 bg-white p-6 max-w-2xl shadow-xl shadow-slate-300/70">
            <div className="flex flex-col gap-5">

              {/* 1. Name */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="add-name" className="text-xs font-semibold uppercase tracking-widest text-slate-600" style={{ fontFamily: "var(--font-body)" }}>
                  Nama Sepatu <span className="text-blue-600">*</span>
                </label>
                <input
                  id="add-name"
                  type="text"
                  placeholder="mis. Air Max Pro 2025"
                  value={form.name}
                  onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setFormError(""); }}
                  disabled={formLoading}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ fontFamily: "var(--font-body)" }}
                />
              </div>

              {/* 2. Category */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="add-category" className="text-xs font-semibold uppercase tracking-widest text-slate-600" style={{ fontFamily: "var(--font-body)" }}>
                  Kategori <span className="text-blue-600">*</span>
                </label>
                <select
                  id="add-category"
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  disabled={formLoading}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* 3. Description */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="add-desc" className="text-xs font-semibold uppercase tracking-widest text-slate-600" style={{ fontFamily: "var(--font-body)" }}>
                  Deskripsi <span className="text-slate-400 normal-case tracking-normal">(opsional)</span>
                </label>
                <textarea
                  id="add-desc"
                  rows={3}
                  placeholder="Deskripsi singkat produk..."
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  disabled={formLoading}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ fontFamily: "var(--font-body)" }}
                />
              </div>

              {/* 4. Image dropzone */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-600" style={{ fontFamily: "var(--font-body)" }}>
                  Foto Produk <span className="text-slate-400 normal-case tracking-normal">(opsional)</span>
                </span>
                <label className="block cursor-pointer">
                  <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${imagePreview ? "border-blue-500/60 bg-blue-50/20" : "border-slate-200 hover:border-blue-500/40 bg-slate-50"
                    }`}>
                    {imagePreview ? (
                      <>
                        <img src={imagePreview} alt="Preview" className="h-32 mx-auto object-cover rounded-lg" />
                        <p className="text-xs text-blue-600 mt-2" style={{ fontFamily: "var(--font-body)" }}>
                          {imageFile?.name} — Klik untuk ganti
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 mx-auto mb-2">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="text-slate-600 text-sm font-medium" style={{ fontFamily: "var(--font-body)" }}>Pilih File Gambar Sepatu</p>
                        <p className="text-slate-400 text-xs mt-1" style={{ fontFamily: "var(--font-body)" }}>.jpg / .jpeg / .png — max 5MB</p>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageSelect(file, false);
                      e.target.value = ""; // reset so same file can be re-selected
                    }}
                  />
                </label>
              </div>

              {/* 5. Variants */}
              <div className="flex flex-col gap-2">
                <div className="border-l-2 border-blue-600 pl-3 mb-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-900" style={{ fontFamily: "var(--font-body)" }}>STOK &amp; HARGA PER UKURAN</p>
                  <p className="text-[10px] text-slate-400 mt-0.5" style={{ fontFamily: "var(--font-body)" }}>Masukkan harga dalam Rupiah tanpa titik (mis. 450000)</p>
                </div>

                <div className="mb-2 hidden sm:grid sm:grid-cols-[1fr_1fr_1.5fr_auto] gap-3 px-1">
                  {["Ukuran", "Stok", "Harga (IDR)", ""].map((h, idx) => (
                    <span key={idx} className="text-[10px] font-semibold uppercase tracking-widest text-slate-400" style={{ fontFamily: "var(--font-body)" }}>{h}</span>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <AnimatePresence>
                    {form.variants.map((v, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.5fr_auto] items-end sm:items-center gap-2.5 sm:gap-3 rounded-xl border border-slate-200/50 bg-slate-50 px-4 py-3 sm:py-2.5 transition-colors hover:border-slate-300">
                          <div className="flex flex-col gap-1 w-full">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 sm:hidden">Ukuran</span>
                            <input
                              type="text"
                              placeholder="mis. 39"
                              value={v.size}
                              onChange={(e) => {
                                setForm((p) => {
                                  const vs = [...p.variants];
                                  vs[i] = { ...vs[i], size: e.target.value };
                                  return { ...p, variants: vs };
                                });
                              }}
                              disabled={formLoading}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-100 disabled:opacity-50"
                              style={{ fontFamily: "var(--font-body)" }}
                            />
                          </div>
                          <div className="flex flex-col gap-1 w-full">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 sm:hidden">Stok</span>
                            <input
                              type="number"
                              min={0}
                              placeholder="0"
                              value={v.stock === 0 ? "" : String(v.stock)}
                              onChange={(e) => {
                                const val = parseInt(e.target.value || "0", 10);
                                setForm((p) => {
                                  const vs = [...p.variants];
                                  vs[i] = { ...vs[i], stock: isNaN(val) ? 0 : Math.max(0, val) };
                                  return { ...p, variants: vs };
                                });
                              }}
                              disabled={formLoading}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-100 disabled:opacity-50"
                              style={{ fontFamily: "var(--font-body)" }}
                            />
                          </div>
                          <div className="flex flex-col gap-1 w-full">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 sm:hidden">Harga (IDR)</span>
                            <input
                              type="number"
                              min={0}
                              placeholder="450000"
                              value={v.price === 0 ? "" : String(v.price)}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value || "0");
                                setForm((p) => {
                                  const vs = [...p.variants];
                                  vs[i] = { ...vs[i], price: isNaN(val) ? 0 : Math.max(0, val) };
                                  return { ...p, variants: vs };
                                });
                              }}
                              disabled={formLoading}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-100 disabled:opacity-50"
                              style={{ fontFamily: "var(--font-body)" }}
                            />
                          </div>
                          <div className="flex justify-end pt-1 sm:pt-0 w-full sm:w-auto">
                            <button
                              type="button"
                              onClick={() => {
                                setForm((p) => {
                                  const vs = p.variants.filter((_, idx) => idx !== i);
                                  return { ...p, variants: vs };
                                });
                              }}
                              disabled={formLoading}
                              className="p-2 sm:p-1 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50 border border-slate-200 sm:border-0 rounded-xl bg-white sm:bg-transparent"
                            >
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setForm((p) => ({
                      ...p,
                      variants: [...p.variants, { size: "", stock: 0, price: 450000 }]
                    }));
                  }}
                  disabled={formLoading}
                  className="mt-2 w-max inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-all hover:bg-blue-700 shadow-sm hover:shadow-blue-600/10 active:scale-95 disabled:opacity-50"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Tambah Ukuran
                </button>
              </div>

              {/* Error */}
              {formError && (
                <div role="alert" className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3" style={{ fontFamily: "var(--font-body)" }}>
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <span>{formError}</span>
                </div>
              )}

              {/* Submit */}
              <button
                id="admin-submit-btn"
                type="button"
                onClick={handleAddProduct}
                disabled={formLoading}
                className="w-full rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold uppercase tracking-widest text-white transition-all duration-200 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {formLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner /> Menyimpan...
                  </span>
                ) : "Simpan Produk"}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ══ FOOTER ════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-sky-100 py-6 mt-8 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-slate-400" style={{ fontFamily: "var(--font-body)" }}>
            <span>© 2026 TEBEEE SPORT. All rights reserved.</span>
          </div>
        </div>
      </footer>

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

      {/* ══════════════════════════════════════════════════════════════════════
          EDIT MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {editOpen && editProduct && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="bg-white border border-slate-200/50 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 shadow-xl relative shadow-slate-300/70">

            {/* Close */}
            <button
              onClick={() => setEditOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-900 text-xl leading-none transition-colors"
              aria-label="Tutup"
            >×</button>

            {/* Header */}
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600 mb-1" style={{ fontFamily: "var(--font-body)" }}>Edit Produk</p>
              <h2 className="text-xl font-bold uppercase tracking-wide text-slate-900 pr-8" style={{ fontFamily: "var(--font-display)" }}>
                {editProduct.name}
              </h2>
            </div>

            <div className="flex flex-col gap-4">

              {/* 1. Name */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-name" className="text-xs font-semibold uppercase tracking-widest text-slate-600" style={{ fontFamily: "var(--font-body)" }}>Nama Sepatu</label>
                <input
                  id="edit-name"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => { setEditForm((p) => ({ ...p, name: e.target.value })); setEditError(""); }}
                  disabled={editLoading}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                  style={{ fontFamily: "var(--font-body)" }}
                />
              </div>

              {/* 2. Category */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-category" className="text-xs font-semibold uppercase tracking-widest text-slate-600" style={{ fontFamily: "var(--font-body)" }}>Kategori</label>
                <select
                  id="edit-category"
                  value={editForm.category}
                  onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))}
                  disabled={editLoading}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* 3. Description */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-desc" className="text-xs font-semibold uppercase tracking-widest text-slate-600" style={{ fontFamily: "var(--font-body)" }}>Deskripsi</label>
                <textarea
                  id="edit-desc"
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                  disabled={editLoading}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                  style={{ fontFamily: "var(--font-body)" }}
                />
              </div>

              {/* 4. Image dropzone (edit) */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-600" style={{ fontFamily: "var(--font-body)" }}>
                  Foto Produk
                </span>
                <label className="block cursor-pointer">
                  <div className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${editImagePreview ? "border-blue-500/60 bg-slate-50/20" : "border-slate-200 hover:border-blue-500/40 bg-slate-50"
                    }`}>
                    {editImagePreview ? (
                      <>
                        <img src={editImagePreview} alt="Preview" className="h-28 mx-auto object-cover rounded-lg" />
                        <p className="text-xs text-blue-600 mt-2" style={{ fontFamily: "var(--font-body)" }}>
                          {editImageFile ? `${editImageFile.name} — Klik untuk ganti` : "Gambar saat ini — Klik untuk ganti"}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600 mx-auto mb-1">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="text-slate-600 text-sm font-medium" style={{ fontFamily: "var(--font-body)" }}>Pilih Gambar Baru</p>
                        <p className="text-slate-400 text-xs mt-0.5" style={{ fontFamily: "var(--font-body)" }}>.jpg / .jpeg / .png — max 5MB</p>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageSelect(file, true);
                      e.target.value = ""; // reset so same file can be re-selected
                    }}
                  />
                </label>
              </div>

              {/* 5. Variant quick-edit */}
              <div className="flex flex-col gap-2">
                <div className="border-l-2 border-blue-600 pl-3 mb-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-900" style={{ fontFamily: "var(--font-body)" }}>STOK &amp; HARGA PER UKURAN</p>
                </div>

                <div className="mb-2 hidden sm:grid sm:grid-cols-[1fr_1fr_1.5fr_auto] gap-3 px-1">
                  {["Ukuran", "Stok", "Harga (IDR)", ""].map((h, idx) => (
                    <span key={idx} className="text-[10px] font-semibold uppercase tracking-widest text-slate-400" style={{ fontFamily: "var(--font-body)" }}>{h}</span>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <AnimatePresence>
                    {editForm.variants.map((v, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.5fr_auto] items-end sm:items-center gap-2.5 sm:gap-3 rounded-xl border border-slate-200/50 bg-slate-50 px-4 py-3 sm:py-2 transition-colors hover:border-slate-300">
                          <div className="flex flex-col gap-1 w-full">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 sm:hidden">Ukuran</span>
                            <input
                              type="text"
                              placeholder="mis. 39"
                              value={v.size}
                              onChange={(e) => {
                                setEditForm((p) => {
                                  const vs = [...p.variants];
                                  vs[i] = { ...vs[i], size: e.target.value };
                                  return { ...p, variants: vs };
                                });
                                setEditError("");
                              }}
                              disabled={editLoading}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-100 disabled:opacity-50"
                              style={{ fontFamily: "var(--font-body)" }}
                            />
                          </div>

                          <div className="flex flex-col gap-1 w-full">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 sm:hidden">Stok</span>
                            <input
                              type="number"
                              min={0}
                              value={v.stock}
                              onChange={(e) => {
                                const val = parseInt(e.target.value || "0", 10);
                                setEditForm((p) => {
                                  const vs = [...p.variants];
                                  vs[i] = { ...vs[i], stock: isNaN(val) ? 0 : Math.max(0, val) };
                                  return { ...p, variants: vs };
                                });
                              }}
                              disabled={editLoading}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-100 disabled:opacity-50"
                              style={{ fontFamily: "var(--font-body)" }}
                            />
                          </div>

                          <div className="flex flex-col gap-1 w-full">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 sm:hidden">Harga (IDR)</span>
                            <input
                              type="number"
                              min={0}
                              value={v.price}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value || "0");
                                setEditForm((p) => {
                                  const vs = [...p.variants];
                                  vs[i] = { ...vs[i], price: isNaN(val) ? 0 : Math.max(0, val) };
                                  return { ...p, variants: vs };
                                });
                              }}
                              disabled={editLoading}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-100 disabled:opacity-50"
                              style={{ fontFamily: "var(--font-body)" }}
                            />
                          </div>

                          <div className="flex justify-end pt-1 sm:pt-0 w-full sm:w-auto">
                            <button
                              type="button"
                              onClick={() => {
                                setEditForm((p) => {
                                  const vs = p.variants.filter((_, idx) => idx !== i);
                                  return { ...p, variants: vs };
                                });
                              }}
                              disabled={editLoading}
                              className="p-2 sm:p-1 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50 border border-slate-200 sm:border-0 rounded-xl bg-white sm:bg-transparent"
                            >
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditForm((p) => ({
                      ...p,
                      variants: [...p.variants, { size: "", stock: 0, price: 450000 }]
                    }));
                  }}
                  disabled={editLoading}
                  className="mt-2 w-max inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-all hover:bg-blue-700 shadow-sm hover:shadow-blue-600/10 active:scale-95 disabled:opacity-50"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Tambah Ukuran
                </button>
              </div>

              {/* Error */}
              {editError && (
                <div role="alert" className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3" style={{ fontFamily: "var(--font-body)" }}>
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <span>{editError}</span>
                </div>
              )}

              {/* Action buttons row */}
              <div className="flex gap-3 mt-4" style={{ fontFamily: "var(--font-body)" }}>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={deleteLoading || editLoading}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm uppercase tracking-wide
                             disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-red-600/10"
                >
                  Hapus Produk
                </button>

                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={editLoading || deleteLoading}
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-white font-bold
                             uppercase tracking-widest hover:bg-blue-700
                             disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-md hover:shadow-blue-600/20"
                >
                  {editLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ══ DELETE CONFIRM MODAL ════════════════════════════════════════════════ */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="bg-white border border-slate-200/50 p-6 rounded-2xl max-w-md w-full shadow-xl shadow-slate-300/70"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <h3 className="text-red-600 font-bold text-lg">Hapus Produk Permanen</h3>
            <p className="text-slate-500 text-sm mt-2">
              Apakah Anda yakin ingin menghapus produk ini secara permanen? Tindakan ini akan menghapus data di database dan file gambar di server.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteLoading}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteProduct}
                disabled={deleteLoading}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-lg shadow-red-600/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteLoading ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ══ TOAST ══════════════════════════════════════════════════════════════ */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border p-4 shadow-xl transition-all ${toast.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
            }`}
          style={{ fontFamily: "var(--font-body)", maxWidth: "22rem" }}
        >
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
