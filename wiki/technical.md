# Technical Documentation

This page provides an overview of the technologies, frameworks, and infrastructure used in Eve Industry Planner.

## Architecture Overview

Eve Industry Planner is built as a microservices architecture with a React frontend and Go backend services, all containerized with Docker and orchestrated via Docker Compose.

## Frontend Stack

### Core Framework
- React 18.3 - Modern React with hooks and functional components
- Vite 7.1 - Fast build tool and development server
- JavaScript - ES6+ JavaScript

### UI Framework
- Material UI (MUI) 7.3 - Comprehensive React component library
- Emotion - CSS-in-JS styling solution
- Recharts 3.2 - Charting library for data visualization

### Routing & State Management
- TanStack Router 1.133 - Type-safe routing with code splitting
- TanStack Query 5.74 - Server state management and data fetching
- Zustand 5.0 - Lightweight state management for client state
- TanStack Virtual 3.13 - Virtual scrolling for large lists

### Build & Development Tools
- Vite - Build tool and dev server
- Vitest 4.0 - Unit testing framework
- Testing Library - React component testing utilities
- Vite PWA Plugin - Progressive Web App support

### Additional Libraries
- Firebase 12.2 - Authentication, Firestore, and hosting
- Sentry 10.12 - Error tracking and monitoring

## Backend Stack

### Core Language
- Go 1.25 - Backend services written in Go

### Services Architecture
The backend is split into three main services:

#### API Service
- RESTful API endpoints
- WebSocket server for real-time updates
- Authentication and authorization

#### Worker Service
- Background job processing
- ESI data synchronization

#### Core Service
- Business logic
- Data change stream monitoring
- Scheduled data refreshes

### Data Storage
- MongoDB - Primary database
  - Replica set configuration (primary + secondary)
  - Change streams for real-time updates
- Redis 9.17 - Caching and session storage

### Message Broker
- NATS - Message queue and pub/sub system

### Key Go Libraries
- MongoDB Driver - Official MongoDB Go driver
- Redis Go Client - Redis client library
- NATS Go Client - NATS messaging client
- Gorilla WebSocket - WebSocket implementation
- JWT - JSON Web Token handling
- UUID - Unique identifier generation
- Cron - Scheduled task execution

## Infrastructure

### Containerization
- Docker - Container runtime
- Docker Compose - Multi-container orchestration
- Alpine Linux - Lightweight base images

### Reverse Proxy
- Traefik - Reverse proxy and load balancer

### Hosting & Deployment
- Firebase Functions - Serverless functions
- GitHub Container Registry - Docker image storage
- Docker Compose - Local and production deployment

### Networking
- Docker Networks - Service isolation and communication
- Traefik Routing - Path-based and hostname-based routing

## External Services & APIs

### Firebase Services
- Firebase Authentication - User authentication
- Cloud Firestore - Real-time database
- Firebase Functions - Serverless backend functions

### Monitoring & Analytics
- Sentry - Error tracking and performance monitoring
- Application Metrics - Custom metrics collection

## Development Tools

### Build Tools
- Make - Build automation
- npm - Node.js package management
- Go Modules - Go dependency management

### Testing
- Vitest - Frontend unit testing
- Testing Library - React component testing
- Go Testing - Backend unit testing

## Wiki System

- Otter Wiki 2

## Related Documentation

- [Settings](settings) - Application configuration
- [Accounts](accounts) - EVE Online account integration
- [Dashboard](dashboard) - Application overview

