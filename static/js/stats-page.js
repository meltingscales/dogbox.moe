            function renderExtensionChart(extensionData) {
                const canvas = document.getElementById("extensionCanvas");
                if (!canvas) return;

                const ctx = canvas.getContext("2d");

                // Sort extensions by count descending
                const entries = Object.entries(extensionData).sort((a, b) => b[1] - a[1]);

                if (entries.length === 0) {
                    ctx.fillStyle = "#666";
                    ctx.font = "16px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText("No file data available", canvas.width / 2, canvas.height / 2);
                    return;
                }

                const labels = entries.map(e => e[0]);
                const values = entries.map(e => e[1]);
                const maxValue = Math.max(...values);

                // Chart dimensions
                const padding = 50;
                const chartWidth = canvas.width - padding * 2;
                const chartHeight = canvas.height - padding * 2;
                const barWidth = chartWidth / labels.length - 10;

                // Clear canvas
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Draw bars
                labels.forEach((label, i) => {
                    const barHeight = (values[i] / maxValue) * chartHeight;
                    const x = padding + i * (barWidth + 10);
                    const y = canvas.height - padding - barHeight;

                    // Gradient for bars
                    const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
                    gradient.addColorStop(0, '#667eea');
                    gradient.addColorStop(1, '#764ba2');

                    ctx.fillStyle = gradient;
                    ctx.fillRect(x, y, barWidth, barHeight);

                    // Value on top of bar
                    ctx.fillStyle = "#333";
                    ctx.font = "12px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText(values[i], x + barWidth / 2, y - 5);

                    // Label below bar
                    ctx.fillStyle = "#666";
                    ctx.font = "11px sans-serif";
                    ctx.save();
                    ctx.translate(x + barWidth / 2, canvas.height - padding + 15);
                    ctx.rotate(-Math.PI / 4);
                    ctx.textAlign = "right";
                    ctx.fillText(label || "unknown", 0, 0);
                    ctx.restore();
                });

                // Y-axis
                ctx.strokeStyle = "#ccc";
                ctx.beginPath();
                ctx.moveTo(padding, padding);
                ctx.lineTo(padding, canvas.height - padding);
                ctx.stroke();

                // X-axis
                ctx.beginPath();
                ctx.moveTo(padding, canvas.height - padding);
                ctx.lineTo(canvas.width - padding, canvas.height - padding);
                ctx.stroke();
            }

            async function loadStats() {
                const loading = document.getElementById("loading");
                const error = document.getElementById("error");
                const container = document.getElementById("stats-container");

                loading.style.display = "block";
                error.style.display = "none";
                container.style.display = "none";

                try {
                    const response = await fetch("/api/stats");
                    if (!response.ok) throw new Error("Failed to fetch");

                    const data = await response.json();

                    // Update values
                    document.getElementById("total-uploads").textContent = data.total_uploads.toLocaleString();
                    document.getElementById("total-posts").textContent = data.total_posts.toLocaleString();
                    document.getElementById("total-files").textContent = data.total_files.toLocaleString();
                    document.getElementById("permanent-count").textContent = data.permanent_count.toLocaleString();
                    document.getElementById("temporary-count").textContent = data.temporary_count.toLocaleString();
                    document.getElementById("total-views").textContent = data.total_views.toLocaleString();
                    document.getElementById("storage-mb").textContent =
                        data.storage_mb.toFixed(2) + " MB";
                    document.getElementById("disk-total").textContent =
                        data.disk_total_gb.toFixed(1) + " GB";
                    document.getElementById("disk-used").textContent =
                        data.disk_used_gb.toFixed(1) + " GB";
                    document.getElementById("disk-free").textContent =
                        data.disk_free_gb.toFixed(1) + " GB";

                    // Render file extension chart
                    renderExtensionChart(data.file_extensions);

                    // Show stats
                    loading.style.display = "none";
                    container.style.display = "block";

                    // Update timestamp
                    document.getElementById("last-updated").textContent =
                        "Last updated: " + new Date().toLocaleString();
                } catch (err) {
                    loading.style.display = "none";
                    error.style.display = "block";
                    console.error("Error loading stats:", err);
                }
            }

            // Initialize page (loads navbar and banners)
            initializePage();

            // Load stats on page load
            loadStats();

            // Auto-refresh every 30 seconds
            setInterval(loadStats, 30000);

            // Event listener for refresh button
            document.getElementById('refreshStatsBtn').addEventListener('click', loadStats);
