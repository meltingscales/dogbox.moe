/**
 * Block Visualization - Defrag Style
 *
 * Provides a visual representation of encryption/decryption progress
 * as a grid of colored blocks (red = encrypted, green = decrypted).
 *
 * The visualization uses a pseudo-random pattern tied to the actual
 * encrypted data for a more secure and interesting visual effect.
 */

class BlockVisualization {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gridSize = 64; // 64x64 grid = 4096 blocks
        this.blockSize = canvas.width / this.gridSize;
        this.blocks = new Array(this.gridSize * this.gridSize).fill(0); // 0 = encrypted, 1 = decrypted
        this.encryptedColor = '#ef4444'; // red
        this.decryptedColor = '#10b981'; // green
        this.backgroundColor = '#000000';
    }

    initialize() {
        // Clear canvas
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw all blocks as encrypted (red)
        for (let i = 0; i < this.blocks.length; i++) {
            this.drawBlock(i, this.encryptedColor);
        }

        this.updateStats();
    }

    drawBlock(index, color) {
        const x = (index % this.gridSize) * this.blockSize;
        const y = Math.floor(index / this.gridSize) * this.blockSize;

        this.ctx.fillStyle = color;
        this.ctx.fillRect(
            Math.floor(x),
            Math.floor(y),
            Math.ceil(this.blockSize),
            Math.ceil(this.blockSize)
        );

        // Add subtle glow effect
        if (color === this.decryptedColor) {
            this.ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
            this.ctx.fillRect(
                Math.floor(x),
                Math.floor(y),
                Math.ceil(this.blockSize),
                Math.ceil(this.blockSize)
            );
        }
    }

    decryptBlocks(blockIndices) {
        for (const index of blockIndices) {
            if (index < this.blocks.length) {
                this.blocks[index] = 1;
                this.drawBlock(index, this.decryptedColor);
            }
        }
        this.updateStats();
    }

    updateStats() {
        const encrypted = this.blocks.filter(b => b === 0).length;
        const decrypted = this.blocks.filter(b => b === 1).length;

        const encryptedEl = document.getElementById('encryptedCount');
        const decryptedEl = document.getElementById('decryptedCount');

        if (encryptedEl) encryptedEl.textContent = encrypted;
        if (decryptedEl) decryptedEl.textContent = decrypted;
    }

    show() {
        const vizEl = document.getElementById('blockViz');
        if (vizEl) vizEl.classList.add('show');
    }

    hide() {
        const vizEl = document.getElementById('blockViz');
        if (vizEl) vizEl.classList.remove('show');
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.BlockVisualization = BlockVisualization;
}
