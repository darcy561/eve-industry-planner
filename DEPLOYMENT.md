# Deployment Guide

## Requirements

Before deploying, ensure you have the following:

## Firebase Requirements

- **Google Firebase**: This build still uses Firebase services and has not been migrated to be completely standalone as of yet. For information on setting this up, reach out via Discord.

### System Requirements

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher (or `docker compose` plugin)
- **Operating System**: Linux, macOS, or Windows (with WSL2 for Windows)
- **Disk Space**: At least 5GB free (for images, volumes, and data)
- **RAM**: Minimum 2GB, recommended 4GB+
- **CPU**: 2+ cores recommended

### Network Requirements

**For Localhost Development:**

- No special network requirements
- Ports 80, 81, 443 should be available (or change in `docker-compose.yml`)

**For Production with Custom Domain:**

- **Domain name**: A registered domain name (e.g., `example.com`)
- **DNS access**: Ability to create DNS A records pointing to your server
- **Public IP**: Server must have a public IP address
- **Port 80**: Must be accessible from the internet (for Let's Encrypt HTTP-01 challenge)
- **Port 443**: Must be accessible from the internet (for HTTPS traffic)
- **Port 81**: Optional, for Traefik dashboard (defaults to localhost-only)

### Access Requirements

- **SSH access**: To the server (for remote deployment)
- **Root/sudo access**: To install Docker if not already installed
- **Firewall**: Ports 80, 443 (and optionally 22 for SSH) must be open

### Optional Requirements

- **Email address**: For Let's Encrypt SSL certificate notifications (if using custom domain)
- **Git**: If cloning the repository (not required if using deployment scripts)

### Verify Requirements

```bash
# Check Docker version
docker --version

# Check Docker Compose version
docker compose version

# Check available ports
netstat -tuln | grep -E ':(80|443|81)'  # Linux
# or
lsof -i :80,443,81  # macOS

# Check disk space
df -h

# Check public IP (if deploying to server)
curl ifconfig.me
```

## Overview

This guide covers deploying the EVE Industry Planner application using Docker Compose. The application supports both localhost development and production deployment with automatic SSL certificate management via Let's Encrypt.

**Key Features:**

- ✅ Automatic domain configuration (just set environment variables)
- ✅ Automatic SSL certificate generation and renewal (Let's Encrypt)
- ✅ Runtime configuration (no image rebuilds needed)
- ✅ Support for both localhost and custom domain deployments
- ✅ One-command deployment scripts

## Quick Start

### Step 0: Create a Deployment Directory

**Before downloading the deployment tool, create a directory where you want to store all deployment files** (docker-compose.yml, .env, etc.). This keeps everything organized in one place.

**Linux/macOS:**

Run these commands one at a time:

```bash
# Step 1: Create a directory (choose a location/name that makes sense for you)
mkdir -p ~/eve-industry-planner

# Step 2: Navigate into the directory
cd ~/eve-industry-planner
```

**Alternative location example:**

```bash
# Step 1: Create directory in /opt
mkdir -p /opt/eve-industry-planner

# Step 2: Navigate into the directory
cd /opt/eve-industry-planner
```

**Windows:**

Run these commands one at a time:

```powershell
# Step 1: Create a directory (choose a location/name that makes sense for you)
New-Item -ItemType Directory -Path "C:\eve-industry-planner" -Force

# Step 2: Navigate into the directory
cd C:\eve-industry-planner
```

**Alternative location example:**

```powershell
# Step 1: Create directory in different location
New-Item -ItemType Directory -Path "D:\Projects\eve-industry-planner" -Force

# Step 2: Navigate into the directory
cd D:\Projects\eve-industry-planner
```

**⚠️ Important:** All subsequent steps should be run from this directory. The deployment tool and all configuration files will be stored here.

### Step 1: Download the Deployment Tool

The deployment tool is a cross-platform application that simplifies the entire deployment process.

**Linux/macOS:**

Run this single command to download and run the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/darcy561/Eve-Industry-Planner-React/migration/deploy/install.sh | bash
```

**Windows:**

Run this single command to download and run the installer:

```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/darcy561/Eve-Industry-Planner-React/migration/deploy/install.ps1" -OutFile "install.ps1"; .\install.ps1
```

The installer will:

1. Detect your operating system and architecture
2. Download the appropriate binary for your platform
3. Rename it to `eip-deployment-tool` (or `eip-deployment-tool.exe` on Windows)
4. Make it executable (Unix systems)
5. Start the deployment tool

### Step 2: Setup Environment Configuration

Run the deployment tool:

```bash
# Linux/macOS
./eip-deployment-tool

# Windows
.\eip-deployment-tool.exe
```

From the interactive menu, select **"Setup Environment (.env file)"**. This will:

1. Download `env.example` from GitHub
2. Create a `.env` file from the example
3. Display next steps for configuration

**⚠️ Important:** After the `.env` file is created, **exit the deployment tool** (select "Exit" from the menu) before proceeding to the next step. You need to manually edit the `.env` file with your configuration values.

### Step 3: Configure Environment Variables

**Exit the deployment tool** (if still running) and **manually edit the `.env` file** with your actual values:

**Linux/Mac:**

```bash
nano .env  # or use your preferred editor (vim, code, etc.)
```

**Windows:**

```powershell
notepad .env  # or use VS Code, Notepad++, etc.
```

**Configuration:**
See the `env.example` file for all available configuration options and detailed descriptions. The file includes comments explaining each variable and its purpose.

**⚠️ Important:** Make sure you have saved your changes to the `.env` file before proceeding to deployment.

### Step 4: Deploy

**Run the deployment tool again** (if you exited it) and select **"Full Deployment (Download, Remove, Pull, Rebuild)"** from the menu. This will:

1. Verify `.env` file exists
2. Download `docker-compose.yml` from GitHub
3. Download Traefik configuration template files
4. Generate `traefik.yml` from template (in project root)
5. Stop and remove existing containers
6. Pull latest container images
7. Rebuild and start all services
8. Verify service status
9. Display domain configuration information

**Alternative: Manual Steps**

If you prefer to use individual commands from the deployment tool menu:

1. **Download Configuration Files** - Downloads all required files from GitHub and generates `traefik.yml`
2. **Start Services (Pull & Start)** - Stops/removes existing containers, pulls images, rebuilds, and starts all services
3. **Pull and Update Containers** - Regenerates `traefik.yml`, pulls latest images, and restarts services (without removing containers)
4. **View Status** - Check service status
5. **View Logs** - Monitor service logs
6. **View Traefik Configuration** - Display the generated `traefik.yml` file

**Using Docker Compose Directly:**

Run these commands one at a time:

```bash
# Step 1: Pull latest images
docker compose pull

# Step 2: Start services
docker compose up -d
```

### Step 4: Verify Deployment

Run these commands one at a time to verify your deployment:

```bash
# Step 1: Check service status
docker compose ps

# Step 2: View logs (press Ctrl+C to stop)
docker compose logs -f

# Step 3: Test frontend
curl http://localhost

# Step 4: Test API
curl http://localhost/api/health
```

## Environment Configuration

For detailed information about all environment variables, see the `env.example` file. It contains comprehensive documentation for each configuration option, including:

- Frontend configuration (Firebase, ReCaptcha, API URL, EVE Online SSO)
- Backend configuration (MongoDB, Redis, NATS, authentication secrets)
- Domain configuration (optional - for SSL with Let's Encrypt)
- Traefik dashboard configuration (optional)

**Note:** If `DOMAIN` and `LETSENCRYPT_EMAIL` are not set, the application will run on localhost with HTTP only.

## Deployment Modes

### Localhost Development (Default)

**Configuration:**

- Leave `DOMAIN` and `LETSENCRYPT_EMAIL` unset in `.env`
- Access via `http://localhost` or any hostname
- No SSL/TLS required
- Uses PathPrefix routing (works with any hostname)

**Start:**

```bash
docker compose up -d
# or
make up
```

**Access:**

- Frontend: `http://localhost`
- API: `http://localhost/api`
- WebSocket: `ws://localhost/ws`
- Traefik Dashboard: `http://localhost:81` (only accessible from localhost - see security section)

### Production with Custom Domain

**Configuration:**

- Set `DOMAIN=yourdomain.com` in `.env`
- Set `LETSENCRYPT_EMAIL=your-email@example.com` in `.env`
- Ensure DNS A record points to your server's IP
- Ensure ports 80 and 443 are open

**Start:**

```bash
docker compose up -d
# or
make up
```

The deployment tool automatically:

- Generates `traefik.yml` from template based on `.env` variables
- Configures Host-based routing (when `DOMAIN` is set)
- Sets up Let's Encrypt SSL certificates (when `DOMAIN` and `LETSENCRYPT_EMAIL` are set)
- Configures HTTP and HTTPS entrypoints
- Handles both localhost (PathPrefix) and domain (Host) routing automatically

**Access:**

- Frontend: `https://yourdomain.com`
- API: `https://yourdomain.com/api`
- WebSocket: `wss://yourdomain.com/ws`
- Traefik Dashboard: `http://localhost:81` (only accessible from server - see security section)

**DNS Setup:**

```
yourdomain.com  A  <your-server-ip>
```

**Let's Encrypt Challenge Type:**

The current configuration uses **HTTP-01 challenge**, which:

- ✅ Only requires a DNS A record pointing to your server IP
- ✅ No nameserver or DNS API configuration needed
- ✅ Automatic renewal works as long as port 80 is accessible
- ✅ Let's Encrypt validates by connecting to your server on port 80

**Firewall:**

- Port 80: Required for Let's Encrypt HTTP challenge (must be accessible from internet)
- Port 443: HTTPS traffic
- Port 81: Traefik dashboard (bound to localhost only - not accessible from internet)

**Alternative: DNS-01 Challenge**

If port 80 is blocked or you need wildcard certificates, you can switch to DNS-01 challenge. This requires:

- DNS provider API credentials (e.g., Cloudflare, Route53, DigitalOcean, etc.)
- Additional Traefik configuration in `traefik.yml.template` for your DNS provider
- See [Traefik DNS Challenge documentation](https://doc.traefik.io/traefik/https/acme/#dnschallenge) for setup

**Note:** For automatic renewal with HTTP-01, you only need the DNS A record - no nameserver configuration is required.

## Architecture

### Services

Eve Industry Planner is broken down into smaller services that handle different tasks.

- **frontend**: React frontend application
- **api**: API & Web Socket server
- **worker**: Background job processor
- **core**: Core business logic service

- **traefik**: Reverse proxy and load balancer with automatic SSL
- **mongo**: MongoDB primary database
- **mongo-secondary**: MongoDB replica set secondary
- **redis**: Redis cache
- **nats**: NATS message broker

### Network

All services run on the `eip` Docker network. Traefik handles:

- Routing based on path prefixes or hostname
- SSL/TLS termination
- Compression
- Caching (frontend)
- Load balancing

### Ports

- **80**: HTTP (redirects to HTTPS if domain configured)
- **443**: HTTPS (when domain configured)
- **81**: Traefik dashboard (bound to localhost only for security)

## Runtime Configuration

### Frontend

The frontend reads environment variables from `.env` at container startup:

- A `config.js` file is generated from environment variables
- Injected into the HTML via script tag
- No rebuild required when changing configuration

### Backend Services

All Go services (API, Worker, Core) read environment variables from `.env` at runtime:

- No secrets baked into images
- Configuration changes require container restart, not rebuild

## Security

### SSL/TLS

When `DOMAIN` and `LETSENCRYPT_EMAIL` are set:

- Automatic SSL certificate generation via Let's Encrypt
- Automatic certificate renewal (handled by Traefik)
- HTTP to HTTPS redirect
- HTTPS-only entrypoints

### Traefik Dashboard Security

The Traefik dashboard is secured by default. You have **two options** for remote access:

#### Option 1: SSH Tunnel (Recommended - Most Secure)

**Default Configuration:**

- Dashboard port (81) is bound to `127.0.0.1` only (localhost)
- IP whitelist middleware restricts access to localhost (127.0.0.1/32, ::1/128)
- Not accessible from the internet
- Only accessible from the server itself or via SSH tunnel

**Access Methods:**

1. **Direct access (when on server):**

   ```bash
   # On the server
   curl http://localhost:81
   ```

2. **SSH tunnel (for remote access):**
   ```bash
   # From your local machine
   ssh -L 81:localhost:81 user@your-server-ip
   # Then access http://localhost:81 in your browser
   ```
   The SSH tunnel forwards your local port 81 to the server's localhost:81, allowing secure access without exposing the dashboard to the internet.

#### Option 2: IP Whitelist (Alternative)

If you prefer not to use SSH tunnels, you can whitelist specific IP addresses or networks:

**Steps:**

1. **Edit `.env` file** to allow specific IPs:

   ```bash
   TRAEFIK_DASHBOARD_ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8,YOUR_IP_ADDRESS/32
   ```

   **Important: Use the IP address that Traefik sees, which depends on where you're connecting from:**

   - **LAN (Local Network) IPs** - Use when accessing from the same local network:

     - `192.168.1.0/24` - Entire local network (e.g., home/office network)
     - `10.0.0.0/8` - Private network range
     - `172.16.0.0/12` - Another private network range
     - `192.168.1.100/32` - Single device on local network

   - **WAN (Public Internet) IPs** - Use when accessing from the internet:
     - `203.0.113.45/32` - Your public IP address (find with `curl ifconfig.me`)
     - `203.0.113.0/24` - Public IP range (if you have multiple static IPs)

   **How to find your IP:**

   ```bash
   # Your public/WAN IP (from internet)
   curl ifconfig.me

   # Your local/LAN IP (on same network as server)
   ip addr show  # Linux
   ifconfig      # macOS/Linux
   ipconfig      # Windows
   ```

   **Note:** Traefik sees the direct source IP of the connection. If you're behind a NAT/router, use the IP that appears in Traefik's access logs.

2. **Modify `docker-compose.yml`** to allow external access:

   ```yaml
   ports:
     - "81:8080" # Change from "127.0.0.1:81:8080"
   ```

   This removes the localhost-only binding and allows connections from whitelisted IPs.

3. **Restart services:**

   **Using the Deployment Tool (Recommended):**
   
   Run the deployment tool and select **"Restart Services"** from the Docker Commands submenu.

   **Manually:**
   
   ```bash
   docker compose restart traefik
   ```

**Security Notes:**

- IP whitelist provides application-level filtering
- Port binding change allows network-level access
- Both layers work together for defense in depth
- **Warning:** If you set `TRAEFIK_DASHBOARD_ALLOWED_IPS=0.0.0.0/0`, the dashboard becomes publicly accessible (not recommended)

**Recommendation:** Use SSH tunnel (Option 1) for the most secure setup. Use IP whitelist (Option 2) only if SSH tunneling is not feasible for your use case.

## Troubleshooting

### Traefik Dashboard IP Whitelist Not Working

**Check which IP Traefik sees:**

**Using the Deployment Tool (Recommended):**

Run the deployment tool and select **"View Logs"**, then choose **"traefik"** to view Traefik logs. Look for dashboard access attempts to see the source IP.

**Manually:**

Run one of these commands:

```bash
# Option 1: View Traefik access logs to see the source IP
docker compose logs traefik | grep dashboard

# Option 2: Check real-time access logs (press Ctrl+C to stop)
docker compose logs -f traefik
```

**Common issues:**

- **Using wrong IP type:** If accessing from local network, use LAN IP (192.168.x.x). If from internet, use WAN/public IP
- **IP changed:** If using dynamic IP, it may change. Check your current IP: `curl ifconfig.me` (WAN) or `ip addr show` (LAN)
- **Behind NAT/router:** The IP Traefik sees might be your router's IP, not your device IP. Check Traefik logs to see the actual source IP
- **Port binding:** Make sure you changed `docker-compose.yml` from `"127.0.0.1:81:8080"` to `"81:8080"` if accessing from outside localhost

**Verify your IP:**

Run one of these commands based on your situation:

```bash
# Your public/WAN IP (what Traefik sees from internet)
curl ifconfig.me

# Your local/LAN IP (what Traefik sees from same network)
ip addr show | grep "inet " | grep -v 127.0.0.1
```

### Services Won't Start

**Check logs:**

**Using the Deployment Tool (Recommended):**

Run the deployment tool and select **"View Logs"**. You can:
- Select **"all"** to view logs from all services
- Select a specific service (e.g., **"api"**, **"frontend"**, **"traefik"**) to view individual service logs
- Choose to follow logs in real-time (press Ctrl+C to stop and return to menu)

**Check service status:**

Run the deployment tool and select **"View Service Status"** from the Docker Commands submenu to see which services are running or failing.

**Manually:**

Run one of these commands:

```bash
# View all services
docker compose logs

# View specific service (choose one)
docker compose logs api
docker compose logs frontend
docker compose logs traefik

# Check service status
docker compose ps
```

**Common issues:**

- Missing or incomplete `.env` file (use deployment tool's "Setup Environment" option)
- Invalid environment variable values
- Port conflicts (check if ports 80, 443, 81 are available)
- Network issues

### Frontend Not Working

**Check logs:**

**Using the Deployment Tool (Recommended):**

Run the deployment tool and select **"View Logs"**, then choose **"frontend"** to view frontend logs.

**Verify configuration:**

**Manually:**

```bash
# Check if config.js is generated
docker compose exec frontend cat /app/dist/config.js

# Check frontend logs
docker compose logs frontend
```

**Common issues:**

- Missing environment variables in `.env` (use deployment tool's "Setup Environment" to recreate if needed)
- Incorrect `API_URL` configuration
- CORS issues (check Traefik routing)

### API/Backend Not Working

**Check logs:**

**Using the Deployment Tool (Recommended):**

Run the deployment tool and select **"View Logs"**, then choose **"api"** to view API logs. This will show connection errors and other issues.

**Verify configuration:**

**Manually:**

Run these commands one at a time:

```bash
# Step 1: Check API logs
docker compose logs api

# Step 2: Check if API is accessible
curl http://localhost/api/health
```

**Common issues:**

- Missing database connection (check `MONGO_URL` in `.env`)
- Missing Redis connection (check `REDIS_URL` in `.env`)
- Missing NATS connection (check `NATS_URL` in `.env`)
- Invalid authentication secrets
- Services not running (use deployment tool's "View Service Status" to check)

### SSL Certificate Issues

**Check Traefik logs:**

**Using the Deployment Tool (Recommended):**

Run the deployment tool and select **"View Logs"**, then choose **"traefik"** to view Traefik logs. Look for ACME, certificate, or Let's Encrypt related messages.

**Manually:**

```bash
docker compose logs traefik | grep -i "acme\|certificate\|letsencrypt"
```

**Common issues:**

- DNS not pointing to server (check with `dig yourdomain.com`)
- Port 80 blocked (required for Let's Encrypt HTTP-01 challenge)
- Invalid email address
- Rate limiting (Let's Encrypt has rate limits)
- DNS propagation delay (can take up to 48 hours, usually much faster)

**Verify DNS:**

Run one of these commands:

```bash
# Option 1: Check DNS with dig
dig yourdomain.com

# Option 2: Check DNS with nslookup
nslookup yourdomain.com
```

**Verify port 80 accessibility:**

```bash
# From another machine, test if port 80 is reachable
curl -I http://yourdomain.com
# Should return HTTP response (even if it's a redirect)
```

**Note:** With HTTP-01 challenge (current setup), you don't need to configure nameservers. Let's Encrypt only needs:

1. DNS A record pointing to your server
2. Port 80 accessible from the internet
3. Traefik running and responding on port 80

Automatic renewal happens in the background - no manual intervention needed. The certificate is stored in `/data/acme.json` and Traefik automatically renews it before expiration.

### Domain Configuration Not Working

**First, verify your `.env` file:**

Make sure `DOMAIN` and `LETSENCRYPT_EMAIL` are set in your `.env` file. You can use the deployment tool's **"Setup Environment (.env file)"** option to recreate the `.env` file if needed (it will prompt before overwriting).

**Verify environment variables are loaded:**

**Manually:**

Run these commands one at a time:

```bash
# Step 1: Check if DOMAIN variable is loaded
docker compose exec traefik env | grep DOMAIN

# Step 2: Check if LETSENCRYPT_EMAIL variable is loaded
docker compose exec traefik env | grep LETSENCRYPT_EMAIL
```

**Restart services:**

If you've updated the `.env` file, you should regenerate `traefik.yml` and restart the services:

**Using the Deployment Tool (Recommended):**

Run the deployment tool and select **"Pull and Update Containers"** from the main menu. This will:
1. Regenerate `traefik.yml` from the template (using updated `.env` values)
2. Pull latest images
3. Restart services

Alternatively, you can:
- Select **"Download Configuration Files"** to regenerate `traefik.yml`
- Then select **"Restart Services"** from the Docker Commands submenu

**Manually:**

```bash
# Regenerate traefik.yml (if you have the template)
# The deployment tool does this automatically

# Restart services
docker compose restart traefik
```

**Common issues:**

- Variables not set in `.env` (use deployment tool's "Setup Environment" to fix)
- `traefik.yml` not regenerated after `.env` changes (use "Pull and Update Containers" or "Download Configuration Files")
- Services need to be restarted after `.env` changes

## Maintenance

### Updating Services

**Using the Deployment Tool (Recommended):**

You have two options:

1. **"Pull and Update Containers"** (from main menu) - Regenerates `traefik.yml`, pulls latest images, and restarts services without removing containers
2. **"Update Services (Pull & Restart)"** (from Docker Commands submenu) - Pulls latest images and restarts services

**Manually:**

Run these commands one at a time:

```bash
# Step 1: Pull latest images
docker compose pull

# Step 2: Restart services
docker compose restart
```

### Updating the Deployment Tool

The deployment tool can update itself! Run the tool and select **"Update Deploy Tool"** from the menu. This will:

1. Download the latest binary for your platform
2. Replace the current binary
3. Optionally restart with the new version

### Viewing Logs

**Using the Deployment Tool:**

Run the deployment tool and select **"View Logs"** from the menu. You can:

- Select a specific service (api, frontend, traefik, mongo, redis, nats, worker, core) or view all services
- Choose to follow logs in real-time (press Ctrl+C to stop and return to menu)

**Manually:**

Run one of these commands (choose based on what you need):

```bash
# View all services (press Ctrl+C to stop)
docker compose logs -f

# View specific service (press Ctrl+C to stop)
docker compose logs -f api
docker compose logs -f frontend
docker compose logs -f traefik

# View last 100 lines (one-time, no follow)
docker compose logs --tail=100
```

### Restarting Services

**Using the Deployment Tool:**

Run the deployment tool and select **"Restart Services"** from the Docker Commands submenu.

**Manually:**

```bash
# All services
docker compose restart

# Specific service
docker compose restart api
```

### Stopping Services

**Using the Deployment Tool:**

Run the deployment tool and select **"Stop Services"** from the Docker Commands submenu. This will stop and remove all containers.

**Manually:**

```bash
# Stop and remove containers (same as deployment tool)
docker compose down

# Stop but keep containers (containers remain but stopped)
docker compose stop

# Stop and remove containers + volumes (⚠️ deletes data)
docker compose down -v
```

### Backup

**MongoDB:**

```bash
docker compose exec mongo mongodump --out /data/backup
```

**Redis:**

```bash
docker compose exec redis redis-cli SAVE
# Backup /data directory
```

## Advanced Configuration

### Custom Traefik Configuration

Traefik configuration files:

- `traefik.yml`: Generated configuration file (in project root) - created from template
- `traefik/traefik.yml.template`: Template file with Let's Encrypt support (downloaded from GitHub)
- `traefik/entrypoint.sh`: Script that processes template based on env vars (if used)

The `traefik.yml` file is automatically generated in the project root from the template when you run "Download Configuration Files" or "Full Deployment". It's regenerated automatically if the template exists when using "Pull and Update Containers".

### Development Mode

For local development with custom builds:

```bash
make dev
```

This uses `docker-compose.dev.yml` which:

- Builds images locally instead of pulling from registry
- Sets development environment variables
- Supports domain configuration (if `DOMAIN` is set)

### Multiple Domains

To support multiple domains, you can:

1. Create additional Traefik routers in `docker-compose.yml`
2. Use Traefik's label-based routing
3. Configure multiple `Host()` rules

## Support

For issues or questions:

- Check logs: `docker compose logs`
- Review Traefik dashboard: `http://localhost:81` (or your domain:81)
- Check service health endpoints
- Review this deployment guide

## Quick Reference

**Using the Deployment Tool:**

```bash
# Run the deployment tool
./eip-deployment-tool        # Linux/macOS
.\eip-deployment-tool.exe    # Windows

# Available options:
# - Setup Environment (.env file)
# - Download Configuration Files
# - Full Deployment (Download, Remove, Pull, Rebuild)
# - Pull and Update Containers
# - View Logs
# - Docker Commands (submenu):
#   - Start Services (Pull & Start) - Stops/removes, pulls, rebuilds, and starts
#   - Stop Services - Stops and removes containers
#   - Restart Services
#   - View Service Status
#   - Update Services (Pull & Restart)
# - View Traefik Configuration
# - Update Deploy Tool
```

**Using Docker Compose Directly:**

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f

# Restart services
docker compose restart

# Update services
docker compose pull && docker compose restart

# Check status
docker compose ps

# Access Traefik dashboard
# Localhost: http://localhost:81
# Production: http://yourdomain.com:81
```
