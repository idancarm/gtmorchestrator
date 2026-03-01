# The Orchestrator

## Project Overview
Backend system that automates GTM operations through HubSpot, integrating with Unipile (LinkedIn proxy), Cargo (data enrichment), and Sumble (data enrichment).

## Architecture
- **HubSpot App**: UI Extensions (Settings, Dashboard, Treatment Status cards)
- **Netlify Backend**: Express.js wrapped with serverless-http
- **External APIs**: Unipile, Sumble, Cargo, HubSpot API, Claude AI

## Key Directories
- `backend/` - Express.js backend deployed to Netlify Functions
- `backend/routes/` - Express route modules
- `backend/services/` - API client services
- `backend/config/` - Rate limits, treatment protocols
- `backend/netlify/functions/` - Serverless function wrappers
- `src/app/cards/` - HubSpot UI Extension cards

## Development
- Backend: `cd backend && npm start` (local) or `npx netlify dev`
- HubSpot: `hs project dev` from root
- Backend URL (production): https://gtmorchestrator.netlify.app
- Backend URL (local): http://localhost:8080

## Conventions
- All backend routes are prefixed with `/api/`
- Service clients live in `backend/services/` and export class instances
- Rate limiting is per-actor (each actor has their own LinkedIn limits)
- HubSpot properties use `orch_` prefix in group `orchestrator`
- Treatment protocols define multi-step automation sequences
