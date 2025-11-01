#!/usr/bin/env python3
"""
Calculate SHA256 hashes of inline scripts for Content Security Policy.

This script scans all HTML files in the static/ directory and generates
SHA256 hashes for inline <script> tags. These hashes are used in the CSP
to allow specific inline scripts without 'unsafe-inline'.

Usage:
    python3 scripts/hash-inline-scripts.py

Or via justfile:
    just hash-scripts

After running, update src/middleware.rs with the generated hashes.
"""

import hashlib
import base64
import re
from pathlib import Path

def extract_inline_scripts(html_content):
    """Extract all inline script contents from HTML."""
    # Match <script> tags without src attribute
    # This regex handles both <script> and <script type="...">
    pattern = r'<script(?:\s+type="[^"]*")?\s*>(.*?)</script>'
    scripts = re.findall(pattern, html_content, re.DOTALL)
    return scripts

def calculate_sha256(script_content):
    """Calculate SHA256 hash of script content and return base64 encoded."""
    # The CSP spec requires the hash to be calculated on the exact text content
    # including whitespace, but NOT including the <script> tags themselves
    sha256_hash = hashlib.sha256(script_content.encode('utf-8')).digest()
    return base64.b64encode(sha256_hash).decode('ascii')

def main():
    # Find the project root (where static/ is)
    script_path = Path(__file__).resolve()
    project_root = script_path.parent.parent
    static_dir = project_root / 'static'

    if not static_dir.exists():
        print(f"Error: static/ directory not found at {static_dir}")
        return 1

    html_files = list(static_dir.glob('*.html'))

    if not html_files:
        print(f"Error: No HTML files found in {static_dir}")
        return 1

    all_hashes = set()
    script_info = []

    print("Scanning HTML files for inline scripts...")
    print("=" * 80)

    for html_file in sorted(html_files):
        content = html_file.read_text()
        scripts = extract_inline_scripts(content)

        if scripts:
            print(f"\n📄 {html_file.name}:")
            for i, script in enumerate(scripts, 1):
                hash_value = calculate_sha256(script)
                all_hashes.add(hash_value)
                preview = script.strip()[:60].replace('\n', ' ')
                print(f"  Script {i}: sha256-{hash_value}")
                print(f"    Preview: {preview}...")
                script_info.append({
                    'file': html_file.name,
                    'hash': hash_value,
                    'preview': preview
                })

    print("\n" + "=" * 80)
    print("🔐 CSP script-src directive (copy this to src/middleware.rs):")
    print("=" * 80)
    print()

    # Format with proper line breaks for Rust
    hashes_list = sorted(all_hashes)
    print("script-src 'self' 'wasm-unsafe-eval' \\")
    for i, h in enumerate(hashes_list):
        if i < len(hashes_list) - 1:
            print(f"  'sha256-{h}=' \\")
        else:
            print(f"  'sha256-{h}=';")

    print("\n" + "=" * 80)
    print(f"✅ Total unique script hashes: {len(all_hashes)}")
    print("=" * 80)
    print()
    print("📝 Next steps:")
    print("1. Copy the CSP directive above")
    print("2. Update src/middleware.rs in the content-security-policy header")
    print("3. Rebuild: cargo build")
    print("4. Restart server: just dev")
    print()

    return 0

if __name__ == '__main__':
    exit(main())
