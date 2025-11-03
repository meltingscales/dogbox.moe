# GKE Deployment Guide for dogbox.moe

## Quick Start

### 1. Setup GKE Cluster (one-time)
```bash
just gke-setup YOUR_PROJECT_ID
```

This creates a GKE Autopilot cluster in `us-central1`. Takes ~5 minutes.

### 2. Build & Deploy
```bash
just gke-deploy YOUR_PROJECT_ID
```

This will:
- Prepare SQLx cache
- Build Docker image
- Push to Google Container Registry
- Deploy to GKE
- Create LoadBalancer service

### 3. Get External IP
```bash
just gke-status
```

Wait for `EXTERNAL-IP` to appear (takes 2-3 minutes). Then point your DNS:
```
A record: dogbox.moe → EXTERNAL-IP
```

## Management Commands

### View logs (live)
```bash
just gke-logs
```

### View pod status
```bash
just gke-status
```

### Restart deployment
```bash
just gke-restart
```

### Scale replicas
```bash
just gke-scale 3  # Scale to 3 pods
```

### SSH into pod
```bash
just gke-shell
```

### Delete app (keeps cluster & data)
```bash
just gke-delete-app
```

### Delete entire cluster
```bash
just gke-delete-cluster YOUR_PROJECT_ID
```

## Architecture

- **Deployment**: Single replica (scalable)
- **Storage**: 10Gi Persistent Volume for SQLite + uploads
- **Service**: LoadBalancer (auto-provisions GCP Load Balancer)
- **Logs**: Automatically sent to Cloud Logging (stdout/stderr)
- **Health checks**: `/api/health` endpoint

## Cost Estimate

GKE Autopilot pricing (approximate):
- Cluster management: $0.10/hour ($73/month)
- Pods: ~$20-30/month for 1 small pod
- Load Balancer: ~$18/month
- Persistent Disk: ~$1.70/month (10GB)

**Total: ~$110-120/month**

For lower cost, consider:
- Standard GKE with e2-small node ($13/month + pod costs)
- Compute Engine VM ($5-10/month)

## Logging

GKE captures all stdout/stderr automatically. View logs:
1. `just gke-logs` (kubectl)
2. Cloud Console → Kubernetes Engine → Workloads → dogbox → Logs
3. `gcloud logging read "resource.type=k8s_container resource.labels.pod_name=dogbox"`

## SSL/HTTPS Setup

### Option 1: Google-managed SSL (recommended)
Use Google Cloud Load Balancer with managed certificates:
```bash
# Apply ingress with managed cert (see k8s/ingress-ssl.yaml)
kubectl apply -f k8s/ingress-ssl.yaml
```

### Option 2: Cert-manager + Let's Encrypt
Install cert-manager and configure automatic certificate renewal.

## Troubleshooting

### Pod won't start
```bash
kubectl describe pod -l app=dogbox
kubectl logs -l app=dogbox
```

### Database issues
```bash
# Check PVC
kubectl describe pvc dogbox-pvc

# Shell into pod
just gke-shell
ls -la /data/
```

### No external IP
```bash
kubectl get service dogbox-service -o yaml
```
Check for errors in service creation.

## Updating the App

```bash
just gke-deploy YOUR_PROJECT_ID
```

This does a rolling update - zero downtime!

## Migration from VM

Your data is in `/data/` on the persistent volume:
- SQLite database: `/data/dogbox.db`
- Uploads: `/data/uploads/`

To migrate existing data:
1. SSH into old VM
2. Copy `dogbox.db` and `uploads/` directory
3. Upload to GCS bucket temporarily
4. Shell into GKE pod: `just gke-shell`
5. Download from GCS to `/data/`
