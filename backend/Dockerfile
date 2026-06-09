FROM php:8.2-fpm-alpine

# Install system dependencies & PHP extensions yang dibutuhkan Laravel
RUN apk add --no-cache \
    nginx \
    supervisor \
    curl \
    libpng-dev \
    libxml2-dev \
    zip \
    unzip \
    git \
    oniguruma-dev

RUN docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd

# Ambil Composer versi terbaru
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Atur direktori kerja di dalam kontainer Linux Google Cloud
WORKDIR /var/www

# Copy seluruh isi folder backend ke dalam kontainer
COPY . /var/www

# Install dependencies PHP menggunakan Composer (Optimized)
RUN composer install --no-dev --optimize-autoloader --no-interaction

# Berikan hak akses (permission) untuk folder storage dan cache Laravel
RUN chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache

# Buka port 8080 (Port standar yang diminta oleh Google Cloud Run secara default)
EXPOSE 8080

# Jalankan server Laravel artisan serve pada port 8080 ketika kontainer menyala
CMD php artisan serve --host=0.0.0.0 --port=8080
