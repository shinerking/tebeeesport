/**
 * Prisma Node.js Microservice — Express server on port 3001
 * Laravel proxies to this service via Http::*('http://localhost:3001/...')
 *
 * IMPORTANT: dotenv MUST be the very first import so DATABASE_URL is populated
 * before any Prisma/Neon code runs.
 */
import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getPrisma, disconnectPrisma } from './prisma/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PRISMA_SERVICE_PORT ?? 3001;

app.use(express.json());

// ─── Multer — file upload setup ───────────────────────────────────────────────

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'products');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const multerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `product-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const multerFilter = (_req, file, cb) => {
  const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png'];
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format file tidak didukung! Hanya diperbolehkan .jpg, .jpeg, dan .png'), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

// ─── Serve uploaded product images as static assets ──────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateInvoiceNo() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `INV/${ymd}/${Date.now().toString().slice(-6)}/${Math.floor(Math.random() * 900) + 100}`;
}

function generateBarcodeToken() {
  return crypto.randomBytes(32).toString('hex');
}

function bizError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.isBiz = true;
  return err;
}

// ─── Mock Shipping Rates ──────────────────────────────────────────────────────

const SHIPPING_RATES = {
  jakarta: { JNE_REG: 15000, JNE_YES: 30000, JNE_OKE: 12000 },
  bandung: { JNE_REG: 18000, JNE_YES: 35000, JNE_OKE: 15000 },
  surabaya: { JNE_REG: 22000, JNE_YES: 40000, JNE_OKE: 18000 },
  yogyakarta: { JNE_REG: 20000, JNE_YES: 38000, JNE_OKE: 16000 },
  default: { JNE_REG: 25000, JNE_YES: 45000, JNE_OKE: 20000 },
};

// ─── Valid status transitions ─────────────────────────────────────────────────

const VALID_TRANSITIONS = {
  UNPAID: ['CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED', 'COMPLETED'], // COMPLETED via barcode (PICKUP)
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── GET /shipping-rates ──────────────────────────────────────────────────────
app.get('/shipping-rates', (req, res) => {
  const city = String(req.query.city ?? '').toLowerCase().trim();
  const service = String(req.query.service ?? '').trim();

  if (!city || !service) {
    return res.status(422).json({ success: false, message: 'city and service query params required' });
  }

  const rates = SHIPPING_RATES[city] ?? SHIPPING_RATES.default;
  const cost = rates[service] ?? SHIPPING_RATES.default[service] ?? 25000;
  const eta = service === 'JNE_YES' ? '1 hari' : '2-3 hari';

  return res.json({ success: true, city, service, cost, eta });
});

// ─── GET /products ────────────────────────────────────────────────────────────
app.get('/products', async (_req, res) => {
  try {
    const prisma = getPrisma();
    const products = await prisma.product.findMany({
      include: { variants: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      success: true,
      data: products,
      meta: { total: products.length, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error('[GET /products]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

// ─── GET /products/:id ────────────────────────────────────────────────────────
app.get('/products/:id', async (req, res) => {
  try {
    const prisma = getPrisma();
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { variants: true },
    });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (error) {
    console.error('[GET /products/:id]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
});

// ─── POST /login ──────────────────────────────────────────────────────────────
app.post('/login', async (req, res) => {
  const { email } = req.body ?? {};

  if (!email || typeof email !== 'string' || email.trim() === '') {
    return res.status(422).json({ success: false, message: 'Email required' });
  }

  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, name: true, email: true, role: true, points: true },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, user });
  } catch (error) {
    console.error('[POST /login]', error);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// ─── POST /products (CREATE) ───────────────────────────────────────────────────
app.post('/products', upload.single('image'), async (req, res) => {
  try {
    const { name, category, description } = req.body ?? {};
    let variants = req.body?.variants;

    if (!name || typeof name !== 'string' || name.trim() === '')
      return res.status(422).json({ success: false, message: 'name is required' });
    if (!category || typeof category !== 'string' || category.trim() === '')
      return res.status(422).json({ success: false, message: 'category is required' });
    if (!variants)
      return res.status(422).json({ success: false, message: 'variants is required' });

    if (typeof variants === 'string') {
      try { variants = JSON.parse(variants); } catch {
        return res.status(422).json({ success: false, message: 'variants must be valid JSON array' });
      }
    }
    if (!Array.isArray(variants) || variants.length === 0)
      return res.status(422).json({ success: false, message: 'variants must be a non-empty array' });

    const imageUrl = req.file
      ? `/uploads/products/${req.file.filename}`
      : (req.body.imageUrl?.trim() || null);

    const prisma = getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name:        name.trim(),
          category:    category.trim(),
          description: description?.trim() ?? null,
          imageUrl,
        },
      });
      await tx.variant.createMany({
        data: variants.map((v) => ({
          productId: product.id,
          size:      String(v.size),
          stock:     parseInt(String(v.stock), 10),
          price:     parseFloat(String(v.price)),
        })),
      });
      return tx.product.findUnique({ where: { id: product.id }, include: { variants: true } });
    });

    return res.status(201).json({ success: true, product: result });
  } catch (err) {
    console.error('[POST /products]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT + POST /products/:id (UPDATE) ────────────────────────────────────────
// Shared handler array: Laravel proxies as POST (method-spoof), Node.js also
// accepts native PUT from direct clients. Both verbs share identical logic.
const handleProductUpdate = [
  upload.single('image'),
  async (req, res) => {
    const { id } = req.params;
    const bodyKeys = Object.keys(req.body ?? {});
    console.log('[UPDATE /products/:id] id:', id, '| file:', req.file?.filename ?? 'NO FILE', '| body keys:', bodyKeys);

    // Guard: empty payload means gateway forwarding failed
    if (bodyKeys.length === 0 && !req.file) {
      return res.status(400).json({
        success: false,
        message: 'Payload kosong — data gagal diteruskan gateway. Periksa Laravel ProductController.',
      });
    }

    try {
      const prisma = getPrisma();

      // GUARD 1: fetch existing product BEFORE transaction — null → 404 + unlink
      const existing = await prisma.product.findUnique({
        where:   { id },
        include: { variants: true },
      });

      if (!existing) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
      }

      // GUARD 2: safe body destructure — fall back to existing DB values
      const body        = req.body ?? {};
      const name        = body.name        ?? existing.name;
      const category    = body.category    ?? existing.category;
      const description = body.description !== undefined ? body.description : existing.description;

      // GUARD 3: imageUrl resolution — new file > forwarded path > keep existing
      let imageUrl = existing.imageUrl;
      if (req.file) {
        imageUrl = `/uploads/products/${req.file.filename}`;
      } else if (body.imageUrl !== undefined && body.imageUrl !== '') {
        imageUrl = body.imageUrl;
      }

      // GUARD 4: parse variants — fall back to existing DB variants on parse error
      let variants = existing.variants;
      if (body.variants) {
        try {
          const parsed = typeof body.variants === 'string'
            ? JSON.parse(body.variants)
            : body.variants;
          if (Array.isArray(parsed) && parsed.length > 0) variants = parsed;
        } catch {
          if (req.file) fs.unlink(req.file.path, () => {});
          return res.status(422).json({ success: false, message: 'Format variants tidak valid (harus JSON array)' });
        }
      }

      // Execute atomic transaction
      const updated = await prisma.$transaction(async (tx) => {
        // Uses update() — NEVER create() — prevents duplicates
        await tx.product.update({
          where: { id },
          data:  { name, category, description, imageUrl },
        });

        // Load existing variants from database to find ones to delete
        const dbVariants = await tx.variant.findMany({
          where: { productId: id },
        });

        const payloadVariants = Array.isArray(variants) ? variants : [];
        const payloadIds = payloadVariants.filter(v => v.id).map(v => v.id);

        // Variants to delete (exist in DB but not in payload)
        const toDelete = dbVariants.filter(v => !payloadIds.includes(v.id));
        if (toDelete.length > 0) {
          const deleteIds = toDelete.map(v => v.id);
          // Cascade clear orders for these variants
          await tx.order.deleteMany({
            where: { variantId: { in: deleteIds } },
          });
          // Delete variants
          await tx.variant.deleteMany({
            where: { id: { in: deleteIds } },
          });
        }

        // Create or Update variants from payload
        for (const v of payloadVariants) {
          if (v.id) {
            await tx.variant.update({
              where: { id: v.id },
              data: {
                stock: Math.max(0, parseInt(String(v.stock), 10) || 0),
                price: Math.max(0, parseFloat(String(v.price)) || 0),
                size: String(v.size),
              },
            });
          } else {
            await tx.variant.create({
              data: {
                productId: id,
                size: String(v.size),
                stock: Math.max(0, parseInt(String(v.stock), 10) || 0),
                price: Math.max(0, parseFloat(String(v.price)) || 0),
              },
            });
          }
        }

        return tx.product.findUnique({ where: { id }, include: { variants: true } });
      });

      return res.status(200).json({ success: true, product: updated });

    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      if (err?.code === 'P2025') {
        return res.status(404).json({ success: false, message: 'Variant ID tidak ditemukan' });
      }
      console.error('[UPDATE /products/:id]', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },
];

// Register shared handler for both verbs
app.put('/products/:id',  ...handleProductUpdate);
app.post('/products/:id', ...handleProductUpdate);

app.delete('/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const prisma = getPrisma();
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });

    // Delete physical image file if exists
    if (product.imageUrl) {
      const filePath = path.join(__dirname, 'public', product.imageUrl);
      fs.unlink(filePath, () => {});  // silent — don't block if file missing
    }

    // Cascade: delete orders referencing variants, then variants, then product
    await prisma.$transaction(async (tx) => {
      // Get all variant IDs for this product
      const variants = await tx.variant.findMany({
        where: { productId: id },
        select: { id: true },
      });
      const variantIds = variants.map((v) => v.id);

      if (variantIds.length > 0) {
        // Delete orders referencing these variants
        await tx.order.deleteMany({
          where: { variantId: { in: variantIds } },
        });
        // Delete variants
        await tx.variant.deleteMany({
          where: { id: { in: variantIds } },
        });
      }

      // Delete product
      await tx.product.delete({
        where: { id },
      });
    });

    return res.json({ success: true, message: 'Produk dan file gambar berhasil dihapus permanen' });

  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    return res.status(500).json({ success: false, message: err.message });
  }
});


// ─── PUT /products/:id/variants ───────────────────────────────────────────────
app.put('/products/:id/variants', async (req, res) => {
  const { id } = req.params;
  const { variants } = req.body ?? {};

  if (!Array.isArray(variants) || variants.length === 0)
    return res.status(422).json({ success: false, message: 'variants must be a non-empty array' });

  const invalid = variants.find((v) => !v.id || (v.stock === undefined && v.price === undefined));
  if (invalid)
    return res.status(422).json({ success: false, message: 'Each variant must have id and at least stock or price' });

  try {
    const prisma = getPrisma();
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    await prisma.$transaction(
      variants.map((v) =>
        prisma.variant.update({
          where: { id: v.id },
          data: {
            ...(v.stock !== undefined && { stock: Number(v.stock) }),
            ...(v.price !== undefined && { price: Number(v.price) }),
          },
        })
      )
    );
    return res.json({ success: true, updated: variants.length });
  } catch (error) {
    console.error('[PUT /products/:id/variants]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /orders ─────────────────────────────────────────────────────────────
app.post('/orders', async (req, res) => {
  const {
    userId,
    variantId,
    quantity,
    fulfillmentMethod,
    shippingAddress,
    shippingCost,
    customerName,
  } = req.body ?? {};

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!variantId)
    return res.status(422).json({ success: false, message: 'variantId required' });

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1)
    return res.status(422).json({ success: false, message: 'quantity must be an integer ≥ 1' });

  if (!fulfillmentMethod || !['SHIPPING', 'PICKUP'].includes(fulfillmentMethod))
    return res.status(422).json({ success: false, message: 'fulfillmentMethod must be SHIPPING or PICKUP' });

  if (!customerName || typeof customerName !== 'string' || customerName.trim() === '')
    return res.status(422).json({ success: false, message: 'customerName required' });

  if (fulfillmentMethod === 'SHIPPING') {
    const addr = shippingAddress ?? {};
    const missing = ['recipientName', 'phone', 'address', 'city'].filter((f) => !addr[f] || String(addr[f]).trim() === '');
    if (missing.length > 0) {
      return res.status(422).json({
        success: false,
        message: `shippingAddress.${missing[0]} required for SHIPPING orders`,
      });
    }
  }

  const cost = fulfillmentMethod === 'PICKUP' ? 0 : (Number(shippingCost) || 0);

  // ── Transaction with unique-collision retry ──────────────────────────────────
  const attemptCreate = async () => {
    const prisma = getPrisma();
    return prisma.$transaction(async (tx) => {
      const variant = await tx.variant.findUnique({ where: { id: variantId } });
      if (!variant) throw bizError(404, 'Variant not found');
      if (variant.stock < qty) throw bizError(400, `Stok tidak cukup. Tersisa: ${variant.stock}`);

      const totalPrice = Math.round(variant.price * qty) + cost;

      await tx.variant.update({
        where: { id: variantId },
        data: { stock: { decrement: qty } },
      });

      return tx.order.create({
        data: {
          invoiceNo: generateInvoiceNo(),
          secureBarcodeToken: generateBarcodeToken(),
          resellerId: userId || null,
          variantId,
          quantity: qty,
          totalPrice,
          shippingCost: cost,
          fulfillmentMethod,
          shippingAddress: fulfillmentMethod === 'SHIPPING' ? shippingAddress : null,
          status: 'UNPAID',
          customerName: customerName.trim(),
          barcodeUsed: false,
        },
      });
    });
  };

  try {
    let order;
    try {
      order = await attemptCreate();
    } catch (err) {
      // P2002 = unique constraint violation — retry once for collision on invoiceNo/token
      if (err?.code === 'P2002') {
        order = await attemptCreate();
      } else {
        throw err;
      }
    }

    return res.status(201).json({
      success: true,
      order: {
        id: order.id,
        invoiceNo: order.invoiceNo,
        secureBarcodeToken: order.secureBarcodeToken,
        totalPrice: order.totalPrice,
        status: order.status,
        fulfillmentMethod: order.fulfillmentMethod,
      },
    });
  } catch (err) {
    if (err?.isBiz) return res.status(err.status || 500).json({ success: false, message: err.message });
    console.error('[POST /orders]', err);
    return res.status(500).json({ success: false, message: err.message ?? 'Order failed' });
  }
});

// ─── POST /orders/webhook-payment ─────────────────────────────────────────────
// NOTE: This route MUST be declared before /orders/:id routes to avoid :id matching "webhook-payment"
app.post('/orders/webhook-payment', async (req, res) => {
  const { invoiceNo, paymentRef } = req.body ?? {};

  if (!invoiceNo || typeof invoiceNo !== 'string' || invoiceNo.trim() === '') {
    return res.status(422).json({ success: false, message: 'invoiceNo required' });
  }

  try {
    const prisma = getPrisma();

    const order = await prisma.order.findUnique({ where: { invoiceNo: invoiceNo.trim() } });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status !== 'UNPAID') {
      return res.status(400).json({ success: false, message: `Order already ${order.status}` });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAID' },
    });

    console.log(`[webhook-payment] Invoice ${invoiceNo} confirmed. PaymentRef: ${paymentRef ?? 'N/A'}`);

    return res.json({ success: true, message: 'Payment confirmed', orderId: updated.id });
  } catch (error) {
    console.error('[POST /orders/webhook-payment]', error);
    return res.status(500).json({ success: false, message: error.message ?? 'Payment confirmation failed' });
  }
});

// ─── PUT /orders/scan-pickup ──────────────────────────────────────────────────
// MUST be declared before /orders/:id routes — "scan-pickup" must not be matched as :id
app.put('/orders/scan-pickup', async (req, res) => {
  const { secureBarcodeToken } = req.body ?? {};

  if (!secureBarcodeToken || typeof secureBarcodeToken !== 'string' || secureBarcodeToken.trim() === '') {
    return res.status(422).json({ success: false, message: 'secureBarcodeToken required' });
  }

  try {
    const prisma = getPrisma();
    const order = await prisma.order.findUnique({
      where: { secureBarcodeToken: secureBarcodeToken.trim() },
      include: { variant: { include: { product: true } }, reseller: { select: { name: true, email: true } } },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // barcodeUsed is the single source of truth — check FIRST
    if (order.barcodeUsed === true) {
      return res.status(403).json({
        success: false,
        message: 'AKSES DITOLAK! Invoice sudah pernah digunakan',
      });
    }

    if (order.status !== 'PAID') {
      return res.status(400).json({ success: false, message: 'Order belum berstatus PAID' });
    }

    if (order.fulfillmentMethod !== 'PICKUP') {
      return res.status(400).json({ success: false, message: 'Bukan pesanan PICKUP' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      return tx.order.update({
        where: { id: order.id },
        data: { status: 'COMPLETED', barcodeUsed: true },
        include: { variant: { include: { product: true } }, reseller: { select: { name: true, email: true } } },
      });
    });

    console.log(`[scan-pickup] Invoice ${order.invoiceNo} completed via barcode scan.`);
    return res.json({ success: true, order: updated });

  } catch (error) {
    console.error('[PUT /orders/scan-pickup]', error);
    return res.status(500).json({ success: false, message: error.message ?? 'Scan failed' });
  }
});

// ─── GET /orders ──────────────────────────────────────────────────────────────
app.get('/orders', async (req, res) => {
  const { userId, role } = req.query;

  try {
    const prisma = getPrisma();
    const include = {
      reseller: { select: { name: true, email: true } },
      variant: { include: { product: true } },
    };

    let orders;
    if (role === 'ADMIN') {
      orders = await prisma.order.findMany({ include, orderBy: { createdAt: 'desc' } });
    } else {
      if (!userId) return res.status(422).json({ success: false, message: 'userId required for RESELLER role' });
      orders = await prisma.order.findMany({
        where: { resellerId: String(userId) },
        include,
        orderBy: { createdAt: 'desc' },
      });
    }

    return res.json({ success: true, orders });
  } catch (error) {
    console.error('[GET /orders]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /orders/:id/barcode-token ────────────────────────────────────────────
app.get('/orders/:id/barcode-token', async (req, res) => {
  const { id } = req.params;
  const { requesterId, requesterRole } = req.query;

  try {
    const prisma = getPrisma();
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Authorization
    if (requesterRole === 'ADMIN') {
      // always allowed
    } else if (requesterRole === 'RESELLER') {
      if (order.resellerId !== String(requesterId)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    return res.json({
      success: true,
      secureBarcodeToken: order.secureBarcodeToken,
      ...(order.barcodeUsed && { barcodeUsed: true }),
    });
  } catch (error) {
    console.error('[GET /orders/:id/barcode-token]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /orders/:id/status ───────────────────────────────────────────────────
app.put('/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, resiNo, scanToken } = req.body ?? {};

  const validStatuses = Object.keys(VALID_TRANSITIONS);
  if (!status || !validStatuses.includes(status)) {
    return res.status(422).json({
      success: false,
      message: `status must be one of: ${validStatuses.join(', ')}`,
    });
  }

  if (status === 'SHIPPED' && (!resiNo || String(resiNo).trim() === '')) {
    return res.status(422).json({ success: false, message: 'resiNo required for SHIPPED status' });
  }

  try {
    const prisma = getPrisma();
    const current = await prisma.order.findUnique({
      where: { id },
      include: { variant: true },
    });
    if (!current) return res.status(404).json({ success: false, message: 'Order not found' });

    // ── Terminal state guard ─────────────────────────────────────────────────
    const allowed = VALID_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(status)) {
      return res.status(422).json({
        success: false,
        message: `Invalid status transition: ${current.status} → ${status}`,
      });
    }

    let updatedOrder;

    // ── Barcode scan path: PAID + PICKUP → COMPLETED ─────────────────────────
    if (status === 'COMPLETED' && current.status === 'PAID') {
      // barcodeUsed is the single source of truth — check it FIRST
      if (current.barcodeUsed === true) {
        return res.status(403).json({
          success: false,
          message: 'Akses Ditolak! Invoice sudah pernah digunakan',
        });
      }
      if (current.fulfillmentMethod !== 'PICKUP') {
        return res.status(400).json({ success: false, message: 'Barcode scan only valid for PICKUP orders' });
      }
      // status was already verified PAID by the transition map check above

      updatedOrder = await prisma.$transaction(async (tx) => {
        return tx.order.update({
          where: { id },
          data: { status: 'COMPLETED', barcodeUsed: true },
          include: { variant: { include: { product: true } }, reseller: { select: { name: true, email: true } } },
        });
      });

      // ── CANCELLED — restore stock and (if applicable) points ─────────────────
    } else if (status === 'CANCELLED') {
      updatedOrder = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id }, include: { variant: true } });
        if (!order) throw bizError(404, 'Order not found');
        if (['CANCELLED', 'COMPLETED'].includes(order.status)) {
          throw bizError(400, 'Cannot cancel a terminal order');
        }
        // Restore stock
        await tx.variant.update({
          where: { id: order.variantId },
          data: { stock: { increment: order.quantity } },
        });
        return tx.order.update({
          where: { id },
          data: { status: 'CANCELLED' },
          include: { variant: { include: { product: true } }, reseller: { select: { name: true, email: true } } },
        });
      });

      // ── SHIPPED — require resiNo ──────────────────────────────────────────────
    } else if (status === 'SHIPPED') {
      updatedOrder = await prisma.order.update({
        where: { id },
        data: { status: 'SHIPPED', resiNo: String(resiNo).trim() },
        include: { variant: { include: { product: true } }, reseller: { select: { name: true, email: true } } },
      });

      // ── All other valid transitions (PAID→PROCESSING, SHIPPED→COMPLETED) ─────
    } else {
      updatedOrder = await prisma.order.update({
        where: { id },
        data: { status },
        include: { variant: { include: { product: true } }, reseller: { select: { name: true, email: true } } },
      });
    }

    return res.json({ success: true, order: updatedOrder });
  } catch (err) {
    if (err?.isBiz) return res.status(err.status || 500).json({ success: false, message: err.message });
    console.error('[PUT /orders/:id/status]', err);
    return res.status(500).json({ success: false, message: err.message ?? 'Update failed' });
  }
});

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Multer / file upload error handler ──────────────────────────────────────
// Must be before the global error handler so 422 is returned for upload errors
app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError || (err.message && err.message.includes('Format file'))) {
    return res.status(422).json({ success: false, message: err.message });
  }
  next(err);
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const shutdown = async (signal) => {
  console.log(`\n[Prisma Service] ${signal} — shutting down…`);
  await disconnectPrisma();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Prisma Service] Listening on http://localhost:${PORT}`);
  console.log(`[Prisma Service] ENV: ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`[Prisma Service] DATABASE_URL set: ${!!process.env.DATABASE_URL}`);
});
