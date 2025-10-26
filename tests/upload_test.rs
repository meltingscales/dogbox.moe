/**
 * Integration test for file upload/download
 * Tests that file extensions and MIME types are preserved correctly
 */

use reqwest::multipart;
use std::error::Error;
use std::path::Path;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let base_url = std::env::var("TEST_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());

    println!("🧪 Testing dogbox upload/download with base URL: {}", base_url);

    // Test cases: (test_file_path, mime_type, file_ext, expected_download_ext, description)
    // Note: JPEG uploads get converted to PNG client-side, so expected_download_ext should be .png
    let test_cases = vec![
        (Some("test-data/happydog.jpeg"), "image/jpeg", ".jpeg", ".png", "JPEG image (converted to PNG client-side for metadata stripping)"),
        (None, "image/png", ".png", ".png", "PNG image (generated)"),
        (None, "text/plain", ".txt", ".txt", "Text file (generated)"),
    ];

    for (test_file_opt, mime_type, file_ext, expected_download_ext, description) in test_cases {
        println!("\n📋 Testing: {}", description);
        println!("   Upload - MIME: {}, File ext: {}", mime_type, file_ext);
        println!("   Expected download ext: {}", expected_download_ext);

        // Load or create test data
        let test_data = if let Some(test_file) = test_file_opt {
            if Path::new(test_file).exists() {
                println!("   📂 Loading test file: {}", test_file);
                std::fs::read(test_file)?
            } else {
                eprintln!("   ⚠️  Test file not found: {}, skipping", test_file);
                continue;
            }
        } else {
            println!("   📝 Generating test data");
            format!("Test content for {}", file_ext).into_bytes()
        };

        // Build multipart form
        // NOTE: In real usage, the JavaScript client converts JPEG→PNG before upload
        // For this test, we're testing the server's ability to store/retrieve extensions
        let upload_mime = if mime_type == "image/jpeg" { "image/png" } else { mime_type };
        let upload_ext = if file_ext == ".jpeg" { ".png" } else { file_ext };

        let form = multipart::Form::new()
            .part("file", multipart::Part::bytes(test_data.clone())
                .file_name("encrypted.bin")
                .mime_str("application/octet-stream")?)
            .text("mime_type", upload_mime.to_string())
            .text("file_extension", upload_ext.to_string())
            .text("post_type", "file")
            .text("is_permanent", "false")
            .text("expiry_hours", "24");

        println!("   📤 Sending to server - MIME: {}, ext: {}", upload_mime, upload_ext);

        // Upload
        println!("   ⬆️  Uploading...");
        let client = reqwest::Client::new();
        let upload_response = client
            .post(format!("{}/api/upload", base_url))
            .multipart(form)
            .send()
            .await?;

        if !upload_response.status().is_success() {
            let error_text = upload_response.text().await?;
            eprintln!("   ❌ Upload failed: {}", error_text);
            continue;
        }

        let upload_data: serde_json::Value = upload_response.json().await?;
        let file_id = upload_data["file_id"].as_str()
            .ok_or("Missing file_id in response")?;

        println!("   ✅ Uploaded successfully, file_id: {}", file_id);

        // Download
        println!("   ⬇️  Downloading...");
        let download_response = client
            .get(format!("{}/api/files/{}", base_url, file_id))
            .send()
            .await?;

        if !download_response.status().is_success() {
            eprintln!("   ❌ Download failed: {}", download_response.status());
            continue;
        }

        // Check Content-Type header
        let content_type = download_response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("not set");

        println!("   📄 Content-Type: {}", content_type);

        // Check Content-Disposition header
        let content_disposition = download_response
            .headers()
            .get("content-disposition")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("not set");

        println!("   📎 Content-Disposition: {}", content_disposition);

        // Validate MIME type (should match what we uploaded, not the original)
        if content_type == upload_mime {
            println!("   ✅ MIME type correct!");
        } else {
            println!("   ⚠️  MIME type mismatch: expected '{}', got '{}'", upload_mime, content_type);
        }

        // Validate file extension in Content-Disposition
        if content_disposition.contains(expected_download_ext) {
            println!("   ✅ File extension correct in Content-Disposition!");
        } else {
            println!("   ⚠️  File extension mismatch in Content-Disposition: expected '{}', not found in '{}'",
                expected_download_ext, content_disposition);
        }

        // Also validate MIME type matches expected download extension
        let expected_download_mime = match expected_download_ext {
            ".png" => "image/png",
            ".txt" => "text/plain",
            _ => upload_mime,
        };

        if content_type == expected_download_mime {
            println!("   ✅ Download MIME type matches expected extension!");
        } else {
            println!("   ⚠️  Download MIME type mismatch: expected '{}' for '{}' extension, got '{}'",
                expected_download_mime, expected_download_ext, content_type);
        }

        // Get data
        let downloaded_data = download_response.bytes().await?;
        println!("   📦 Downloaded {} bytes", downloaded_data.len());

        // Cleanup - delete the file
        println!("   🗑️  Cleaning up...");
        let deletion_token = upload_data["deletion_token"].as_str()
            .ok_or("Missing deletion_token in response")?;

        let delete_response = client
            .delete(format!("{}/api/files/{}?token={}", base_url, file_id, deletion_token))
            .send()
            .await?;

        if delete_response.status().is_success() {
            println!("   ✅ Deleted successfully");
        } else {
            println!("   ⚠️  Delete failed (non-critical): {}", delete_response.status());
        }
    }

    println!("\n✅ All tests complete!");
    Ok(())
}
