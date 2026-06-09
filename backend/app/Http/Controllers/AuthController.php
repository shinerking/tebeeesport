<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AuthController extends Controller
{
    private string $prismaServiceUrl;

    public function __construct()
    {
        $this->prismaServiceUrl = config('services.prisma.url', 'http://localhost:3001');
    }

    /**
     * POST /api/login
     *
     * Validates the incoming email, forwards the request to the Prisma
     * Node.js microservice, and passes the response back to the caller
     * with the exact HTTP status code returned by the service.
     *
     * Responses:
     *   200 – { success: true,  user: { id, name, email, role, points } }
     *   404 – { success: false, message: "User not found" }
     *   422 – { success: false, message: "Email required" }  (caught by Laravel validation)
     *   503 – { message: "Auth service unavailable" }        (connection failure)
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
        ]);

        try {
            $response = Http::timeout(10)
                ->acceptJson()
                ->post("{$this->prismaServiceUrl}/login", [
                    'email' => $request->email,
                ]);

            // Pass-through the status code and JSON body as-is.
            return response()->json($response->json(), $response->status());

        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('Auth service unreachable', ['error' => $e->getMessage()]);

            return response()->json([
                'message' => 'Auth service unavailable',
            ], 503);
        }
    }
}
