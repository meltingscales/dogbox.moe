/**
 * dogbox.moe Format Converter
 *
 * Converts files to privacy-safe formats:
 * - Images → PNG (strips all EXIF/metadata)
 * - Videos → WebM (strips all metadata)
 *
 * All conversions happen client-side for privacy
 */

class FormatConverter {
    constructor() {
        this.supportedImageInputs = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
        this.supportedVideoInputs = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/avi'];
        this.supportedAudioInputs = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'];
    }

    /**
     * Check if file needs conversion
     */
    needsConversion(file) {
        const type = file.type.toLowerCase();

        // Already in correct format
        if (type === 'image/png' || type === 'video/webm') {
            return false;
        }

        // Check if it's a supported type that can be converted
        return this.supportedImageInputs.includes(type) ||
               this.supportedVideoInputs.includes(type) ||
               this.supportedAudioInputs.includes(type);
    }

    /**
     * Get the category of a file
     */
    getFileCategory(file) {
        const type = file.type.toLowerCase();
        if (this.supportedImageInputs.includes(type)) return 'image';
        if (this.supportedVideoInputs.includes(type)) return 'video';
        if (this.supportedAudioInputs.includes(type)) return 'audio';
        return 'unknown';
    }

    /**
     * Convert image to PNG (strips all metadata)
     */
    async convertImageToPNG(file, onProgress) {
        try {
            onProgress?.({ status: 'loading', progress: 0 });

            // Load image
            const img = await this.loadImage(file);
            onProgress?.({ status: 'converting', progress: 50 });

            // Create canvas and draw image (strips metadata)
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            onProgress?.({ status: 'encoding', progress: 75 });

            // Convert to PNG blob (lossless, no metadata)
            const blob = await new Promise((resolve) => {
                canvas.toBlob(resolve, 'image/png', 1.0);
            });

            onProgress?.({ status: 'complete', progress: 100 });

            // Return new file with .png extension
            const newName = this.changeExtension(file.name, 'png');
            return new File([blob], newName, { type: 'image/png' });

        } catch (err) {
            throw new Error(`Failed to convert image: ${err.message}`);
        }
    }

    /**
     * Convert video to WebM using canvas + MediaRecorder
     * Note: This is a simple implementation. For production, consider ffmpeg.wasm
     */
    async convertVideoToWebM(file, onProgress) {
        try {
            onProgress?.({ status: 'loading', progress: 0 });

            // Create video element
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.muted = true;

            // Wait for video to load
            await new Promise((resolve, reject) => {
                video.onloadedmetadata = resolve;
                video.onerror = reject;
            });

            onProgress?.({ status: 'converting', progress: 25 });

            // Create canvas for video frames
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');

            // Set up MediaRecorder to capture canvas stream
            const stream = canvas.captureStream(30); // 30 FPS

            // Add audio track if video has audio
            if (video.mozHasAudio || video.webkitAudioDecodedByteCount > 0) {
                const audioContext = new AudioContext();
                const source = audioContext.createMediaElementSource(video);
                const dest = audioContext.createMediaStreamDestination();
                source.connect(dest);
                stream.addTrack(dest.stream.getAudioTracks()[0]);
            }

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: 2500000 // 2.5 Mbps
            });

            const chunks = [];
            mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

            // Start recording
            mediaRecorder.start();
            video.play();

            // Draw frames to canvas
            const drawFrame = () => {
                if (!video.paused && !video.ended) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const progress = 25 + (video.currentTime / video.duration) * 50;
                    onProgress?.({ status: 'converting', progress });
                    requestAnimationFrame(drawFrame);
                }
            };
            drawFrame();

            // Wait for video to finish
            await new Promise((resolve) => {
                video.onended = resolve;
            });

            onProgress?.({ status: 'encoding', progress: 80 });

            // Stop recording
            mediaRecorder.stop();

            // Wait for final data
            const blob = await new Promise((resolve) => {
                mediaRecorder.onstop = () => {
                    resolve(new Blob(chunks, { type: 'video/webm' }));
                };
            });

            onProgress?.({ status: 'complete', progress: 100 });

            // Clean up
            URL.revokeObjectURL(video.src);

            // Return new file with .webm extension
            const newName = this.changeExtension(file.name, 'webm');
            return new File([blob], newName, { type: 'video/webm' });

        } catch (err) {
            throw new Error(`Failed to convert video: ${err.message}`);
        }
    }

    /**
     * Convert audio to WebM audio (Opus codec)
     */
    async convertAudioToWebM(file, onProgress) {
        try {
            onProgress?.({ status: 'loading', progress: 0 });

            // Create audio element
            const audio = document.createElement('audio');
            audio.src = URL.createObjectURL(file);

            // Wait for audio to load
            await new Promise((resolve, reject) => {
                audio.onloadedmetadata = resolve;
                audio.onerror = reject;
            });

            onProgress?.({ status: 'converting', progress: 25 });

            // Set up MediaRecorder
            const audioContext = new AudioContext();
            const source = audioContext.createMediaElementSource(audio);
            const dest = audioContext.createMediaStreamDestination();
            source.connect(dest);

            const mediaRecorder = new MediaRecorder(dest.stream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000 // 128 kbps
            });

            const chunks = [];
            mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

            // Start recording
            mediaRecorder.start();
            audio.play();

            // Update progress
            const progressInterval = setInterval(() => {
                const progress = 25 + (audio.currentTime / audio.duration) * 50;
                onProgress?.({ status: 'converting', progress });
            }, 100);

            // Wait for audio to finish
            await new Promise((resolve) => {
                audio.onended = resolve;
            });

            clearInterval(progressInterval);
            onProgress?.({ status: 'encoding', progress: 80 });

            // Stop recording
            mediaRecorder.stop();

            // Wait for final data
            const blob = await new Promise((resolve) => {
                mediaRecorder.onstop = () => {
                    resolve(new Blob(chunks, { type: 'audio/webm' }));
                };
            });

            onProgress?.({ status: 'complete', progress: 100 });

            // Clean up
            URL.revokeObjectURL(audio.src);

            // Return new file with .webm extension
            const newName = this.changeExtension(file.name, 'webm');
            return new File([blob], newName, { type: 'audio/webm' });

        } catch (err) {
            throw new Error(`Failed to convert audio: ${err.message}`);
        }
    }

    /**
     * Main conversion function - routes to appropriate converter
     */
    async convert(file, onProgress) {
        const category = this.getFileCategory(file);

        switch (category) {
            case 'image':
                return await this.convertImageToPNG(file, onProgress);
            case 'video':
                return await this.convertVideoToWebM(file, onProgress);
            case 'audio':
                return await this.convertAudioToWebM(file, onProgress);
            default:
                throw new Error(`Unsupported file type: ${file.type}`);
        }
    }

    // Utility functions

    loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    changeExtension(filename, newExt) {
        const lastDot = filename.lastIndexOf('.');
        const nameWithoutExt = lastDot > 0 ? filename.substring(0, lastDot) : filename;
        return `${nameWithoutExt}.${newExt}`;
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.FormatConverter = FormatConverter;
}
