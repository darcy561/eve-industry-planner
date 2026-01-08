# Deployment Guide

## Requirements

Before deploying, ensure you have the following:

## Firebase Requirements

- **Google Firebase**: This build still uses Firebase services and has not been migrated to be completely standalone as of yet. For information on setting this up, reach out via Discord.

### System Requirements

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher (or `docker compose` plugin)
- **Operating System**: Linux
- **Make**: Required for deployment commands (install with `sudo apt-get install make` or `sudo yum install make`)
- **curl or wget**: Required for downloading files
- **Disk Space**: At least 5GB free (for images, volumes, and data)
- **RAM**: Minimum 2GB, recommended 4GB+
- **CPU**: 2+ cores recommended

### Network Requirements
**For Production with Custom Domain:**
- **Domain name**: A registered domain name (e.g., `example.com`)
- **DNS access**: Ability to create DNS A records pointing to your server
- **Public IP**: Server must have a public IP address
- **Port 80**: Must be accessible from the internet (for HTTP traffic)
- **Port 443**: Must be accessible from the internet (for HTTPS traffic, if SSL is configured)

### Access Requirements

- **SSH access**: To the server (for remote deployment)
- **Root/sudo access**: To install Docker if not already installed
- **Firewall**: Ports 80, 443 (and optionally 22 for SSH) must be open

### Optional Requirements

- None required

### Verify Requirements

```bash
# Check Docker version
docker --version

# Check Docker Compose version
docker compose version

# Check if make is installed
make --version

# If make is not installed, install it:
# Ubuntu/Debian:
sudo apt-get update && sudo apt-get install -y make

# CentOS/RHEL/Fedora:
sudo yum install make
# or for newer versions:
sudo dnf install make

```

## Overview

This guide covers deploying the EVE Industry Planner application using Docker Compose. The application supports both localhost development and production deployment.

## Quick Start

### Step 1: Create Directory and Download Makefile

```bash
# Create a directory for deployment
mkdir -p ~/your_chosen_directory
cd ~/your_chosen_directory

# Download the Makefile
curl -L -f -o Makefile \
    "https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/Makefile"
```

### Step 2: Initial Setup

```bash
make up
```

This automatically downloads all required files, creates `.env` from `env.example`, generates the MongoDB keyfile.

### Step 3: Configure Environment

Edit the `.env` file with your configuration values:

```bash
nano .env
```

See `env.example` for all available options and descriptions.

### Step 4: Start Services

After configuring `.env`, start the services:

```bash
make up
```

## Environment Configuration

For detailed information about all environment variables, see the `env.example` file. It contains comprehensive documentation for each configuration option, including:

- Frontend configuration (Firebase, ReCaptcha, API URL, EVE Online SSO)
- Backend configuration (MongoDB, Redis, NATS, authentication secrets)

```

**Access:**

- Site: `http://yourdomain.com` (or `https://yourdomain.com` if SSL is configured)


**SSL Configuration:**

If you want to use HTTPS, you must set up the domain and SSL certificates yourself. Traefik will route traffic on port 443 once certificates are configured, but no automatic certificate setup is performed.

You have two options:

1. **Use Traefik to manage certificates** (requires manual configuration):
   - Traefik can automatically obtain and renew SSL certificates from Let's Encrypt
   - This requires manual configuration of Traefik's ACME (Automatic Certificate Management Environment) settings
   - You'll need to configure Traefik with your Let's Encrypt account details and DNS/HTTP challenge settings
   - See the [Traefik documentation](https://doc.traefik.io/traefik/https/acme/) for detailed setup instructions
   - This approach gives you full control but requires more configuration

2. **Use a third-party SSL provider** (recommended for simplicity):
   - Use a service like **Cloudflare** to handle SSL/TLS termination
   - Cloudflare provides free SSL certificates and handles all certificate management automatically
   - Simply point your domain's nameservers to Cloudflare and enable their proxy/CDN service
   - Traffic will be encrypted between users and Cloudflare, then forwarded to your server
   - This is the easiest option and requires no certificate management on your server

**Firewall:**

- Port 80: Required for HTTP traffic (must be accessible from internet)
- Port 443: Required for HTTPS traffic (if SSL is configured, must be accessible from internet)

## Architecture

### Services

Eve Industry Planner is broken down into smaller services that handle different tasks.

- **frontend**: React frontend application
- **api**: API & Web Socket server
- **worker**: Background job processor
- **core**: Core business logic service

- **traefik**: Reverse proxy and load balancer
- **mongo**: MongoDB primary database
- **mongo-secondary**: MongoDB replica set secondary
- **redis**: Redis cache
- **nats**: NATS message broker

### Network

All services run on the `eip` Docker network. Traefik handles:

- Routing based on path prefixes or hostname
- Compression
- Caching (frontend)
- Load balancing

### Ports

- **80**: HTTP
- **443**: HTTPS (if SSL certificates are configured)


## Updating the Application

To update the application to the latest version.

```bash
# Step 1: Update all files from GitHub (Makefile, docker-compose.yml, scripts)
make update-files

# Step 2: Restart services to apply updates
make up
```

This will:
1. Update the Makefile, docker-compose.yml, and all setup scripts from GitHub
2. Pull the latest container images
3. Restart all services with the updated configuration

## Maintenance

### Viewing Logs

```bash
docker compose logs -f
```

**Log Levels:**

Log verbosity is controlled by the `LOG_LEVEL` environment variable in your `.env` file. Valid values are:
- `debug` - Most verbose, shows all log messages
- `info` - Default, shows informational messages and above
- `warn` or `warning` - Shows warnings and errors only
- `error` - Shows only error messages

To change the log level, edit the `LOG_LEVEL` variable in your `.env` file and restart the services. See `env.example` for more details.

### Restarting Services

```bash
docker compose restart
```

### Stopping Services

```bash
docker compose down
```

## Advanced Configuration

### Development Mode

For development users working locally after cloning the repository:

```bash
make dev
```

This builds images locally and uses development settings. Only use this if you're developing and have cloned the repository.

## Support

For issues or questions:

- Check logs: `docker compose logs -f`
- Review this deployment guide

## Quick Reference

```bash
# Start services (downloads missing files, creates .env if needed)
make up

# Update all files from GitHub and restart
make update-files
make up

# Development mode (for local development only)
make dev

# Show help
make help
```
