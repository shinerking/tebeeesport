FROM php:8.3-fpm-alpine

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

RUN apk add --no-cache postgresql-dev
RUN docker-php-ext-install pdo_pgsql pgsql pdo_mysql mbstring exif pcntl bcmath gd

# Ambil Composer versi terbaru
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Atur direktori kerja di dalam kontainer Linux
WORKDIR /var/www

# Salin isi dari sub-folder backend ke direktori kerja kontainer
COPY backend /var/www

# Install dependencies PHP menggunakan Composer
RUN composer install --no-dev --optimize-autoloader --no-interaction

# Berikan hak akses untuk folder storage dan cache Laravel
RUN chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache

# Buka port 8080 untuk Google Cloud Run
EXPOSE 8080

# Jalankan server Laravel
CMD php artisan serve --host=0.0.0.0 --port=8080