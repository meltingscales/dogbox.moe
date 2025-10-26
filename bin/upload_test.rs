/**
 * Integration test for dogbox.moe
 * Tests file uploads, post uploads, appending, and markdown support
 */

use reqwest::multipart;
use serde_json::json;
use std::error::Error;
use std::path::Path;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let base_url = std::env::var("TEST_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());

    println!("🧪 Testing dogbox.moe integration with base URL: {}", base_url);
    println!("{}", "=".repeat(80));

    // Run all tests
    test_file_uploads(&base_url).await?;
    test_post_creation(&base_url).await?;
    test_post_append(&base_url).await?;
    test_post_markdown(&base_url).await?;
    test_post_file_append(&base_url).await?;

    println!("\n{}", "=".repeat(80));
    println!("✅ All tests passed successfully!");
    Ok(())
}

/// Test basic file uploads with different MIME types and extensions
async fn test_file_uploads(base_url: &str) -> Result<(), Box<dyn Error>> {
    println!("\n📁 TEST: File Uploads");
    println!("{}", "-".repeat(80));

    let test_cases = vec![
        (Some("test-data/happydog.jpeg"), "image/jpeg", ".jpeg", ".png", "JPEG image (converted to PNG)"),
        (None, "image/png", ".png", ".png", "PNG image (generated)"),
        (None, "text/plain", ".txt", ".txt", "Text file (generated)"),
        (None, "application/zip", ".zip", ".zip", "ZIP archive (generated)"),
    ];

    for (test_file_opt, mime_type, file_ext, expected_download_ext, description) in test_cases {
        println!("\n  📋 Test: {}", description);

        let test_data = if let Some(test_file) = test_file_opt {
            if Path::new(test_file).exists() {
                println!("     📂 Loading: {}", test_file);
                std::fs::read(test_file)?
            } else {
                println!("     ⚠️  File not found: {}, skipping", test_file);
                continue;
            }
        } else {
            println!("     📝 Generating test data");
            format!("Test content for {}", file_ext).into_bytes()
        };

        // Adjust for client-side conversion (JPEG→PNG)
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

        let client = reqwest::Client::new();
        let upload_response = client
            .post(format!("{}/api/upload", base_url))
            .multipart(form)
            .send()
            .await?;

        if !upload_response.status().is_success() {
            let error_text = upload_response.text().await?;
            return Err(format!("❌ Upload failed: {}", error_text).into());
        }

        let upload_data: serde_json::Value = upload_response.json().await?;
        let file_id = upload_data["file_id"].as_str()
            .ok_or("Missing file_id in response")?;
        println!("     ✅ Uploaded: {}", file_id);

        // Download and verify
        let download_response = client
            .get(format!("{}/api/files/{}", base_url, file_id))
            .send()
            .await?;

        if !download_response.status().is_success() {
            return Err(format!("❌ Download failed: {}", download_response.status()).into());
        }

        let content_type = download_response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("not set");

        let content_disposition = download_response
            .headers()
            .get("content-disposition")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("not set");

        if content_type == upload_mime {
            println!("     ✅ MIME type correct: {}", content_type);
        } else {
            return Err(format!("❌ MIME type mismatch: expected '{}', got '{}'", upload_mime, content_type).into());
        }

        if content_disposition.contains(expected_download_ext) {
            println!("     ✅ Extension correct: {}", expected_download_ext);
        } else {
            return Err(format!("❌ Extension mismatch: expected '{}' in '{}'", expected_download_ext, content_disposition).into());
        }

        // Cleanup
        let deletion_token = upload_data["deletion_token"].as_str()
            .ok_or("Missing deletion_token")?;

        let delete_response = client
            .delete(format!("{}/api/files/{}?token={}", base_url, file_id, deletion_token))
            .send()
            .await?;

        if delete_response.status().is_success() {
            println!("     ✅ Deleted successfully");
        } else {
            println!("     ⚠️  Delete failed: {}", delete_response.status());
        }
    }

    Ok(())
}

/// Test creating posts
async fn test_post_creation(base_url: &str) -> Result<(), Box<dyn Error>> {
    println!("\n📝 TEST: Post Creation");
    println!("{}", "-".repeat(80));

    let test_content = "This is a test post!\n\nIt contains multiple lines.";
    let form = multipart::Form::new()
        .part("file", multipart::Part::bytes(test_content.as_bytes().to_vec())
            .file_name("encrypted.bin")
            .mime_str("application/octet-stream")?)
        .text("mime_type", "text/plain")
        .text("post_type", "post")
        .text("is_permanent", "false")
        .text("expiry_hours", "24");

    let client = reqwest::Client::new();
    let upload_response = client
        .post(format!("{}/api/upload", base_url))
        .multipart(form)
        .send()
        .await?;

    if !upload_response.status().is_success() {
        let error_text = upload_response.text().await?;
        return Err(format!("❌ Post creation failed: {}", error_text).into());
    }

    let upload_data: serde_json::Value = upload_response.json().await?;
    let post_id = upload_data["file_id"].as_str()
        .ok_or("Missing file_id in response")?;
    let post_append_key = upload_data["post_append_key"].as_str()
        .ok_or("Missing post_append_key in response")?;

    println!("  ✅ Post created: {}", post_id);
    println!("  🔑 Append key: {}...", &post_append_key[..20]);

    // Verify we can view the post
    let view_response = client
        .get(format!("{}/api/posts/{}", base_url, post_id))
        .send()
        .await?;

    if !view_response.status().is_success() {
        return Err(format!("❌ Failed to view post: {}", view_response.status()).into());
    }

    let post_data: serde_json::Value = view_response.json().await?;
    let content_count = post_data["content"].as_array()
        .ok_or("Missing content array")?
        .len();

    if content_count == 1 {
        println!("  ✅ Post content verified: {} entries", content_count);
    } else {
        return Err(format!("❌ Expected 1 content entry, got {}", content_count).into());
    }

    // Cleanup
    let deletion_token = upload_data["deletion_token"].as_str()
        .ok_or("Missing deletion_token")?;

    client
        .delete(format!("{}/api/files/{}?token={}", base_url, post_id, deletion_token))
        .send()
        .await?;

    println!("  ✅ Post deleted");

    Ok(())
}

/// Test appending content to posts
async fn test_post_append(base_url: &str) -> Result<(), Box<dyn Error>> {
    println!("\n➕ TEST: Post Appending");
    println!("{}", "-".repeat(80));

    // Create initial post
    let initial_content = "First entry in the post.";
    let form = multipart::Form::new()
        .part("file", multipart::Part::bytes(initial_content.as_bytes().to_vec())
            .file_name("encrypted.bin")
            .mime_str("application/octet-stream")?)
        .text("mime_type", "text/plain")
        .text("post_type", "post")
        .text("is_permanent", "false")
        .text("expiry_hours", "24");

    let client = reqwest::Client::new();
    let upload_response = client
        .post(format!("{}/api/upload", base_url))
        .multipart(form)
        .send()
        .await?;

    if !upload_response.status().is_success() {
        let error_text = upload_response.text().await?;
        return Err(format!("❌ Post creation failed: {}", error_text).into());
    }

    let upload_data: serde_json::Value = upload_response.json().await?;
    let post_id = upload_data["file_id"].as_str()
        .ok_or("Missing file_id")?;
    let post_append_key = upload_data["post_append_key"].as_str()
        .ok_or("Missing post_append_key")?;

    println!("  ✅ Initial post created: {}", post_id);

    // Append multiple entries
    let append_contents = vec![
        "Second entry - appended!",
        "Third entry - another append!",
        "Fourth entry - final append!",
    ];

    for (i, content) in append_contents.iter().enumerate() {
        // NOTE: In production, the client encrypts content and base64 encodes it before sending
        // For this test, we're base64 encoding plain text to simulate the format
        let content_base64 = BASE64.encode(content.as_bytes());
        let append_request = json!({
            "append_key": post_append_key,
            "content": content_base64,
            "content_type": "markdown"
        });

        let append_response = client
            .post(format!("{}/api/posts/{}/append", base_url, post_id))
            .json(&append_request)
            .send()
            .await?;

        if !append_response.status().is_success() {
            let error_text = append_response.text().await?;
            return Err(format!("❌ Append {} failed: {}", i + 1, error_text).into());
        }

        println!("  ✅ Appended entry {}", i + 2);
    }

    // Verify all entries are present
    let view_response = client
        .get(format!("{}/api/posts/{}", base_url, post_id))
        .send()
        .await?;

    if !view_response.status().is_success() {
        return Err(format!("❌ Failed to view post: {}", view_response.status()).into());
    }

    let post_data: serde_json::Value = view_response.json().await?;
    let content_count = post_data["content"].as_array()
        .ok_or("Missing content array")?
        .len();

    let expected_count = 1 + append_contents.len(); // Initial + appends
    if content_count == expected_count {
        println!("  ✅ All {} entries verified", content_count);
    } else {
        return Err(format!("❌ Expected {} entries, got {}", expected_count, content_count).into());
    }

    // Test invalid append key
    let invalid_content_base64 = BASE64.encode(b"This should fail");
    let invalid_request = json!({
        "append_key": "INVALID_KEY",
        "content": invalid_content_base64
    });

    let invalid_response = client
        .post(format!("{}/api/posts/{}/append", base_url, post_id))
        .json(&invalid_request)
        .send()
        .await?;

    if !invalid_response.status().is_success() {
        println!("  ✅ Invalid append key correctly rejected");
    } else {
        return Err("❌ Invalid append key was accepted!".into());
    }

    // Cleanup
    let deletion_token = upload_data["deletion_token"].as_str()
        .ok_or("Missing deletion_token")?;

    client
        .delete(format!("{}/api/files/{}?token={}", base_url, post_id, deletion_token))
        .send()
        .await?;

    println!("  ✅ Post deleted");

    Ok(())
}

/// Test markdown content in posts
async fn test_post_markdown(base_url: &str) -> Result<(), Box<dyn Error>> {
    println!("\n📄 TEST: Markdown Support in Posts");
    println!("{}", "-".repeat(80));

    // Create post with markdown content
    let markdown_content = r#"# Test Post with Markdown

## Features
- **Bold text**
- *Italic text*
- `Code inline`

## Code Block
```rust
fn main() {
    println!("Hello from dogbox!");
}
```

## Links
[Visit dogbox](https://dogbox.moe)

## Lists
1. First item
2. Second item
3. Third item

> This is a blockquote with **markdown** inside.
"#;

    let form = multipart::Form::new()
        .part("file", multipart::Part::bytes(markdown_content.as_bytes().to_vec())
            .file_name("encrypted.bin")
            .mime_str("application/octet-stream")?)
        .text("mime_type", "text/plain")
        .text("post_type", "post")
        .text("is_permanent", "false")
        .text("expiry_hours", "24");

    let client = reqwest::Client::new();
    let upload_response = client
        .post(format!("{}/api/upload", base_url))
        .multipart(form)
        .send()
        .await?;

    if !upload_response.status().is_success() {
        let error_text = upload_response.text().await?;
        return Err(format!("❌ Markdown post creation failed: {}", error_text).into());
    }

    let upload_data: serde_json::Value = upload_response.json().await?;
    let post_id = upload_data["file_id"].as_str()
        .ok_or("Missing file_id")?;

    println!("  ✅ Markdown post created: {}", post_id);

    // Verify post can be retrieved
    let view_response = client
        .get(format!("{}/api/posts/{}", base_url, post_id))
        .send()
        .await?;

    if !view_response.status().is_success() {
        return Err(format!("❌ Failed to view markdown post: {}", view_response.status()).into());
    }

    let post_data: serde_json::Value = view_response.json().await?;
    let content_entries = post_data["content"].as_array()
        .ok_or("Missing content array")?;

    if content_entries.len() == 1 {
        println!("  ✅ Markdown content stored correctly");

        let first_entry = &content_entries[0];
        let stored_content_base64 = first_entry["content_encrypted"].as_str()
            .ok_or("Missing content_encrypted")?;

        // The content is base64 encoded in the database, decode it to verify
        let stored_content_bytes = BASE64.decode(stored_content_base64)
            .map_err(|e| format!("Failed to decode base64: {}", e))?;
        let stored_content = String::from_utf8_lossy(&stored_content_bytes);

        // Verify markdown content is preserved (should contain markdown syntax)
        if stored_content.contains("# Test Post") &&
           stored_content.contains("```rust") &&
           stored_content.contains("**Bold text**") {
            println!("  ✅ Markdown syntax preserved");
        } else {
            return Err("❌ Markdown syntax not preserved correctly".into());
        }
    } else {
        return Err(format!("❌ Expected 1 entry, got {}", content_entries.len()).into());
    }

    // Append more markdown content
    let post_append_key = upload_data["post_append_key"].as_str()
        .ok_or("Missing post_append_key")?;

    let append_markdown = r#"## Update

This is an appended entry with more **markdown**:

- Item A
- Item B
- Item C
"#;

    let append_markdown_base64 = BASE64.encode(append_markdown.as_bytes());
    let append_request = json!({
        "append_key": post_append_key,
        "content": append_markdown_base64,
        "content_type": "markdown"
    });

    let append_response = client
        .post(format!("{}/api/posts/{}/append", base_url, post_id))
        .json(&append_request)
        .send()
        .await?;

    if append_response.status().is_success() {
        println!("  ✅ Markdown appended successfully");
    } else {
        let error_text = append_response.text().await?;
        return Err(format!("❌ Markdown append failed: {}", error_text).into());
    }

    // Verify both entries
    let final_view = client
        .get(format!("{}/api/posts/{}", base_url, post_id))
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    let final_count = final_view["content"].as_array()
        .ok_or("Missing content array")?
        .len();

    if final_count == 2 {
        println!("  ✅ Both markdown entries present");
    } else {
        return Err(format!("❌ Expected 2 entries, got {}", final_count).into());
    }

    // Cleanup
    let deletion_token = upload_data["deletion_token"].as_str()
        .ok_or("Missing deletion_token")?;

    client
        .delete(format!("{}/api/files/{}?token={}", base_url, post_id, deletion_token))
        .send()
        .await?;

    println!("  ✅ Markdown post deleted");

    Ok(())
}

/// Test appending file attachments to posts
async fn test_post_file_append(base_url: &str) -> Result<(), Box<dyn Error>> {
    println!("\n📎 TEST: Post File Appending");
    println!("{}", "-".repeat(80));

    // Create initial post with markdown
    let initial_markdown = "# My Post\n\nThis post will have file attachments appended.";
    let form = multipart::Form::new()
        .part("file", multipart::Part::bytes(initial_markdown.as_bytes().to_vec())
            .file_name("encrypted.bin")
            .mime_str("application/octet-stream")?)
        .text("mime_type", "text/plain")
        .text("post_type", "post")
        .text("is_permanent", "false")
        .text("expiry_hours", "24");

    let client = reqwest::Client::new();
    let upload_response = client
        .post(format!("{}/api/upload", base_url))
        .multipart(form)
        .send()
        .await?;

    if !upload_response.status().is_success() {
        let error_text = upload_response.text().await?;
        return Err(format!("❌ Post creation failed: {}", error_text).into());
    }

    let upload_data: serde_json::Value = upload_response.json().await?;
    let post_id = upload_data["file_id"].as_str()
        .ok_or("Missing file_id")?;
    let post_append_key = upload_data["post_append_key"].as_str()
        .ok_or("Missing post_append_key")?;

    println!("  ✅ Initial post created: {}", post_id);

    // Append a "file" (simulated with test data)
    let file_content = b"This is a test file attachment!";
    let file_content_base64 = BASE64.encode(file_content);

    let append_file_request = json!({
        "append_key": post_append_key,
        "content": file_content_base64,
        "content_type": "file",
        "mime_type": "text/plain",
        "file_extension": ".txt",
        "file_size": file_content.len()
    });

    let append_response = client
        .post(format!("{}/api/posts/{}/append", base_url, post_id))
        .json(&append_file_request)
        .send()
        .await?;

    if !append_response.status().is_success() {
        let error_text = append_response.text().await?;
        return Err(format!("❌ File append failed: {}", error_text).into());
    }

    println!("  ✅ File attachment appended");

    // Append another markdown entry
    let more_markdown = "## Update\n\nAdded a file above!";
    let markdown_base64 = BASE64.encode(more_markdown.as_bytes());

    let append_markdown_request = json!({
        "append_key": post_append_key,
        "content": markdown_base64,
        "content_type": "markdown"
    });

    let append_markdown_response = client
        .post(format!("{}/api/posts/{}/append", base_url, post_id))
        .json(&append_markdown_request)
        .send()
        .await?;

    if !append_markdown_response.status().is_success() {
        let error_text = append_markdown_response.text().await?;
        return Err(format!("❌ Markdown append after file failed: {}", error_text).into());
    }

    println!("  ✅ Markdown appended after file");

    // Verify all entries are present with correct types
    let view_response = client
        .get(format!("{}/api/posts/{}", base_url, post_id))
        .send()
        .await?;

    if !view_response.status().is_success() {
        return Err(format!("❌ Failed to view post: {}", view_response.status()).into());
    }

    let post_data: serde_json::Value = view_response.json().await?;
    let content_entries = post_data["content"].as_array()
        .ok_or("Missing content array")?;

    if content_entries.len() != 3 {
        return Err(format!("❌ Expected 3 entries, got {}", content_entries.len()).into());
    }

    // Verify content types
    let entry0_type = content_entries[0]["content_type"].as_str().unwrap_or("");
    let entry1_type = content_entries[1]["content_type"].as_str().unwrap_or("");
    let entry2_type = content_entries[2]["content_type"].as_str().unwrap_or("");

    if entry0_type == "markdown" && entry1_type == "file" && entry2_type == "markdown" {
        println!("  ✅ Content types correct: markdown, file, markdown");
    } else {
        return Err(format!("❌ Content types incorrect: {}, {}, {}", entry0_type, entry1_type, entry2_type).into());
    }

    // Verify file metadata
    let file_entry = &content_entries[1];
    if file_entry["mime_type"].as_str() == Some("text/plain") &&
       file_entry["file_extension"].as_str() == Some(".txt") &&
       file_entry["file_size"].as_i64() == Some(file_content.len() as i64) {
        println!("  ✅ File metadata preserved correctly");
    } else {
        return Err("❌ File metadata not preserved correctly".into());
    }

    // Cleanup
    let deletion_token = upload_data["deletion_token"].as_str()
        .ok_or("Missing deletion_token")?;

    client
        .delete(format!("{}/api/files/{}?token={}", base_url, post_id, deletion_token))
        .send()
        .await?;

    println!("  ✅ Post with file attachments deleted");

    Ok(())
}
