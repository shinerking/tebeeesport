<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ProductController extends Controller
{
    private string $prismaServiceUrl;

    public function __construct()
    {
        $this->prismaServiceUrl = config('services.prisma.url', 'http://localhost:3001');
    }

    /**
     * GET /api/products
     * Proxy to the Prisma Node.js microservice and return Product[] with Variant[].
     */
    public function index(): JsonResponse
    {
        try {
            $response = Http::timeout(10)
                ->acceptJson()
                ->get("{$this->prismaServiceUrl}/products");

            if ($response->failed()) {
                Log::error('Prisma service error', [
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);

                return response()->json([
                    'success' => false,
                    'message' => 'Product service unavailable',
                ], $response->status() >= 500 ? 502 : $response->status());
            }

            return response()->json($response->json(), $response->status());

        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('Prisma service unreachable', ['error' => $e->getMessage()]);

            return response()->json([
                'success' => false,
                'message' => 'Product service is currently unreachable. Please try again later.',
            ], 503);
        }
    }

    /**
     * GET /api/products/{id}
     */
    public function show(string $id): JsonResponse
    {
        try {
            $response = Http::timeout(10)
                ->acceptJson()
                ->get("{$this->prismaServiceUrl}/products/{$id}");

            if ($response->status() === 404) {
                return response()->json(['success' => false, 'message' => 'Product not found'], 404);
            }

            if ($response->failed()) {
                Log::error('Prisma service error on show', [
                    'id'     => $id,
                    'status' => $response->status(),
                ]);

                return response()->json([
                    'success' => false,
                    'message' => 'Product service unavailable',
                ], 502);
            }

            return response()->json($response->json(), $response->status());

        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('Prisma service unreachable on show', ['error' => $e->getMessage()]);

            return response()->json([
                'success' => false,
                'message' => 'Product service is currently unreachable.',
            ], 503);
        }
    }

    /**
     * POST /api/products
     * Create a new product with variants via the Prisma microservice.
     * Forwards multipart/form-data including optional image file.
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $call = Http::timeout(30)->acceptJson();

            if ($request->hasFile('image')) {
                $file = $request->file('image');
                $call = $call->attach(
                    'image',
                    file_get_contents($file->getRealPath()),
                    $file->getClientOriginalName()
                );
            }

            $response = $call->post("{$this->prismaServiceUrl}/products", [
                'name'        => $request->input('name'),
                'category'    => $request->input('category'),
                'description' => $request->input('description'),
                'variants'    => $request->input('variants'),
                'imageUrl'    => $request->input('imageUrl'),
            ]);

            return response()->json($response->json(), $response->status());
        } catch (\Exception $e) {
            Log::error('Prisma service unreachable on store', ['error' => $e->getMessage()]);
            return response()->json(['success' => false, 'message' => 'Upload service unavailable'], 503);
        }
    }

    /**
     * POST /api/products/{id}  (frontend POSTs with _method=PUT field)
     * Proxies a multipart PUT to the Node.js microservice.
     *
     * WHY POST NOT PUT: Guzzle's Http::put()->attach() silently drops the multipart body.
     * Http::asMultipart()->send('PUT', url) reliably delivers it.
     * Frontend sends POST so Laravel can receive the full multipart payload,
     * then we forward to Node.js as a true PUT.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        try {
            $multipart = Http::timeout(30)->asMultipart();

            // Forward image file if present and valid
            if ($request->hasFile('image') && $request->file('image')->isValid()) {
                $file      = $request->file('image');
                $multipart = $multipart->attach(
                    'image',
                    file_get_contents($file->getRealPath()),
                    $file->getClientOriginalName(),
                    ['Content-Type' => $file->getMimeType()]
                );
            }

            // Forward text fields individually (never mix ->post($array) with ->attach())
            foreach (['name', 'category', 'variants', 'imageUrl'] as $field) {
                if ($request->filled($field)) {
                    $multipart = $multipart->attach($field, (string) $request->input($field));
                }
            }

            // description uses has() not filled() — allows admins to clear it (empty string)
            if ($request->has('description')) {
                $multipart = $multipart->attach('description', (string) $request->input('description', ''));
            }

            // send('PUT') — only reliable multipart PUT path through Guzzle/Laravel Http facade
$response = $multipart->post("http://localhost:3001/products/{$id}");
            return response()->json($response->json(), $response->status());

        } catch (\Exception $e) {
            Log::error('Prisma service unreachable on update', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gateway error: ' . $e->getMessage(),
            ], 503);
        }
    }

    /**
     * PUT /api/products/{id}/variants
     * Bulk-update stock and price for an existing product's variants.
     */
    public function updateVariants(Request $request, string $id): JsonResponse
    {
        $request->validate([
            'variants' => ['required', 'array', 'min:1'],
        ]);

        try {
            $response = Http::timeout(10)
                ->acceptJson()
                ->put("{$this->prismaServiceUrl}/products/{$id}/variants", $request->all());

            return response()->json($response->json(), $response->status());

        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('Prisma service unreachable on updateVariants', ['error' => $e->getMessage()]);

            return response()->json([
                'success' => false,
                'message' => 'Product service unavailable',
            ], 503);
        }
    }

    /**
     * DELETE /api/products/{id}
     * Proxy permanent deletion to Prisma microservice.
     */
    public function destroy(string $id): JsonResponse
    {
        try {
            $response = Http::timeout(15)->delete("{$this->prismaServiceUrl}/products/{$id}");
            return response()->json($response->json(), $response->status());
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Service unavailable'], 503);
        }
    }
}
