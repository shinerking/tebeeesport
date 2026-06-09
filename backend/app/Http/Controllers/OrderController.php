<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class OrderController extends Controller
{
    private string $prismaServiceUrl;

    public function __construct()
    {
        $this->prismaServiceUrl = config('services.prisma.url', 'http://localhost:3001');
    }

    /**
     * GET /api/orders
     * Forwards ?userId and ?role to the Node microservice.
     */
    public function index(Request $request): JsonResponse
    {
        try {
            $response = Http::timeout(15)
                ->acceptJson()
                ->get("{$this->prismaServiceUrl}/orders", $request->only(['userId', 'role']));

            return response()->json($response->json(), $response->status());

        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('Order service unreachable on index', ['error' => $e->getMessage()]);
            return response()->json(['success' => false, 'message' => 'Order service unavailable'], 503);
        }
    }

    /**
     * POST /api/orders
     * Creates a new order. Stock is reserved at creation; payment collected separately.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'variantId'         => ['required', 'string'],
            'quantity'          => ['required', 'integer', 'min:1'],
            'fulfillmentMethod' => ['required', 'in:SHIPPING,PICKUP'],
            'customerName'      => ['required', 'string'],
        ]);

        try {
            $response = Http::timeout(15)
                ->acceptJson()
                ->post("{$this->prismaServiceUrl}/orders", $request->all());

            return response()->json($response->json(), $response->status());

        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('Order service unreachable on store', ['error' => $e->getMessage()]);
            return response()->json(['success' => false, 'message' => 'Order service unavailable'], 503);
        }
    }

    /**
     * POST /api/orders/webhook-payment
     * Simulated payment gateway webhook — marks an UNPAID order as PAID.
     */
    public function webhookPayment(Request $request): JsonResponse
    {
        $request->validate([
            'invoiceNo' => ['required', 'string'],
        ]);

        try {
            $response = Http::timeout(15)
                ->acceptJson()
                ->post("{$this->prismaServiceUrl}/orders/webhook-payment", $request->all());

            return response()->json($response->json(), $response->status());

        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('Order service unreachable on webhookPayment', ['error' => $e->getMessage()]);
            return response()->json(['success' => false, 'message' => 'Order service unavailable'], 503);
        }
    }

    /**
     * PUT /api/orders/{id}/status
     * Advances or cancels an order. Enforces transition rules on the Node side.
     */
    public function updateStatus(Request $request, string $id): JsonResponse
    {
        $request->validate([
            'status' => ['required', 'in:UNPAID,PAID,PROCESSING,SHIPPED,COMPLETED,CANCELLED'],
            'resiNo' => ['nullable', 'string'],
        ]);

        try {
            $response = Http::timeout(15)
                ->acceptJson()
                ->put("{$this->prismaServiceUrl}/orders/{$id}/status", $request->all());

            return response()->json($response->json(), $response->status());

        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('Order service unreachable on updateStatus', ['error' => $e->getMessage()]);
            return response()->json(['success' => false, 'message' => 'Order service unavailable'], 503);
        }
    }

    /**
     * GET /api/orders/{id}/barcode-token
     * Returns the secureBarcodeToken for QR generation.
     * ADMIN: always allowed. RESELLER: only for their own orders.
     */
    public function getBarcodeToken(Request $request, string $id): JsonResponse
    {
        try {
            $response = Http::timeout(15)
                ->acceptJson()
                ->get(
                    "{$this->prismaServiceUrl}/orders/{$id}/barcode-token",
                    $request->only(['requesterId', 'requesterRole'])
                );

            return response()->json($response->json(), $response->status());

        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('Order service unreachable on getBarcodeToken', ['error' => $e->getMessage()]);
            return response()->json(['success' => false, 'message' => 'Order service unavailable'], 503);
        }
    }
}
