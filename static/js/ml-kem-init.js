/**
 * ML-KEM-1024 Initialization
 *
 * Import and setup post-quantum cryptography library.
 * ML-KEM-1024 provides maximum security: ~256-bit classical, ~192-bit quantum
 */

import { ml_kem1024 } from '/static/lib/@noble/post-quantum/ml-kem.js';

// Make available globally for non-module scripts
window.noblePostQuantum = { ml_kem1024 };

// Signal that the library is loaded
window.noblePostQuantumReady = true;
window.dispatchEvent(new Event('noblePostQuantumReady'));
