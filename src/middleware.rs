use axum::{
    body::Body,
    http::{Request, Response, StatusCode, header},
    middleware::Next,
};

/// Security headers middleware
/// Adds essential security headers to all responses
pub async fn security_headers(
    request: Request<Body>,
    next: Next,
) -> Result<Response<Body>, StatusCode> {
    let mut response = next.run(request).await;

    let headers = response.headers_mut();

    // Prevent clickjacking
    headers.insert(
        header::HeaderName::from_static("x-frame-options"),
        header::HeaderValue::from_static("DENY"),
    );

    // Prevent MIME sniffing
    headers.insert(
        header::HeaderName::from_static("x-content-type-options"),
        header::HeaderValue::from_static("nosniff"),
    );

    // Enable XSS protection
    headers.insert(
        header::HeaderName::from_static("x-xss-protection"),
        header::HeaderValue::from_static("1; mode=block"),
    );

    // Strict Transport Security (HSTS) - only sent over HTTPS
    headers.insert(
        header::HeaderName::from_static("strict-transport-security"),
        header::HeaderValue::from_static("max-age=31536000; includeSubDomains"),
    );

    // Content Security Policy - restrict resource loading
    // Script hashes allow specific inline scripts (import maps and initialization)
    // 'wasm-unsafe-eval' required for BLAKE3 WASM compilation
    // To regenerate hashes: just hash-scripts
    headers.insert(
        header::HeaderName::from_static("content-security-policy"),
        header::HeaderValue::from_static(
            "default-src 'self'; \
             script-src 'self' 'wasm-unsafe-eval' \
               'sha256-HUvE11OLFz7AoCbhbk01ZWOcwLvkI+CahEfFg54mSTU=' \
               'sha256-SGWGvJu8HcqulHmTV7/WfP/TjcWCtNH40zGJbhmurLQ=' \
               'sha256-UwIxe9p9b2FNZcGBE29ru4ohO+xC1LiOPTC/1s6DRDI=' \
               'sha256-dOFOu+c3tOHIxiHjp4NQ7kBAJNPVqIV2C0nsVeEtLZU=' \
               'sha256-gXFFdg/UCt0MfJH9IbdwGFsCxpsE4aa9D0vNkYyzRcA=='; \
             style-src 'self' 'unsafe-inline'; \
             img-src 'self' data: blob:; \
             media-src 'self' blob:; \
             font-src 'self' data:; \
             connect-src 'self'; \
             frame-ancestors 'none';"
        ),
    );

    // Referrer policy
    headers.insert(
        header::HeaderName::from_static("referrer-policy"),
        header::HeaderValue::from_static("strict-origin-when-cross-origin"),
    );

    // Permissions policy
    headers.insert(
        header::HeaderName::from_static("permissions-policy"),
        header::HeaderValue::from_static("geolocation=(), microphone=(), camera=()"),
    );

    Ok(response)
}

/// CSRF protection middleware
/// Validates Origin header for state-changing requests (POST, DELETE)
pub async fn csrf_protection(
    request: Request<Body>,
    next: Next,
) -> Result<Response<Body>, StatusCode> {
    let method = request.method();

    // Only check state-changing methods
    if method == "POST" || method == "DELETE" || method == "PUT" || method == "PATCH" {
        let headers = request.headers();

        // Check Origin header if present
        if let Some(origin) = headers.get(header::ORIGIN) {
            let origin_str = origin.to_str().unwrap_or("");

            // Allow same-origin and our domain
            let allowed_origins = [
                "http://localhost",
                "http://127.0.0.1",
                "https://dogbox.moe",
                "http://dogbox.moe",
                "https://www.dogbox.moe",
                "http://www.dogbox.moe",
            ];

            let is_allowed = allowed_origins.iter().any(|&allowed| {
                origin_str == allowed || origin_str.starts_with(&format!("{}:", allowed))
            });

            if !is_allowed {
                tracing::warn!("CSRF: Blocked request from origin: {}", origin_str);
                return Err(StatusCode::FORBIDDEN);
            }
        }

        // For API requests, also check for X-Requested-With or Content-Type: application/json
        // This prevents simple form submissions from browsers
        let has_custom_header = headers.get("x-requested-with").is_some();
        let content_type = headers.get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let is_json = content_type.contains("application/json");
        let is_multipart = content_type.contains("multipart/form-data");

        // Allow if: custom header present, JSON content type, or multipart (for file uploads)
        if !has_custom_header && !is_json && !is_multipart {
            // For upload endpoint, we allow multipart without custom headers
            // For other endpoints, require JSON or custom header
            let path = request.uri().path();
            if !path.starts_with("/api/upload") {
                tracing::warn!("CSRF: Blocked request without custom header or JSON content type");
                return Err(StatusCode::FORBIDDEN);
            }
        }
    }

    Ok(next.run(request).await)
}
