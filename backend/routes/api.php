<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\ProductController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

Route::prefix('products')->controller(ProductController::class)->group(function () {
    Route::get('/',              'index');
    Route::get('{id}',          'show');
    Route::post('/',            'store');
    // POST + fd._method=PUT: bypass Guzzle multipart-PUT silent body drop
    Route::post('{id}', 'update')->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\ConvertEmptyStringsToNull::class);
    Route::put('{id}/variants', 'updateVariants');
    Route::delete('{id}',        'destroy');
});

Route::post('/login', [AuthController::class, 'login']);

// ── Orders ──────────────────────────────────────────────────────────────────
Route::get('/orders',                        [OrderController::class, 'index']);
Route::post('/orders',                       [OrderController::class, 'store']);
Route::post('/orders/webhook-payment',       [OrderController::class, 'webhookPayment']);
Route::put('/orders/scan-pickup', function (Request $request) {
    try {
        // send('PUT') — only reliable multipart PUT path through Guzzle/Laravel Http facade
        $response = Http::timeout(15)->asMultipart()->send('PUT', 'http://localhost:3001/orders/scan-pickup', ['multipart' => $request->all()]);
        return response()->json($response->json(), $response->status());
    } catch (\Illuminate\Http\Client\ConnectionException) {
        return response()->json(['success' => false, 'message' => 'Order service unavailable'], 503);
    }
});
Route::put('/orders/{id}/status',            [OrderController::class, 'updateStatus']);
Route::get('/orders/{id}/barcode-token',     [OrderController::class, 'getBarcodeToken']);

// ── Shipping rates (thin inline proxy — no controller needed) ────────────────
Route::get('/shipping-rates', function (Request $request) {
    try {
        $response = Http::timeout(10)
            ->acceptJson()
            ->get('http://localhost:3001/shipping-rates', $request->all());
        return response()->json($response->json(), $response->status());
    } catch (\Illuminate\Http\Client\ConnectionException) {
        return response()->json(['success' => false, 'message' => 'Shipping service unavailable'], 503);
    }
});


