# Qawaed — staged implementation

This repository reconstructs the existing prototype as reviewable milestones. It is not a claim that the prototype was originally written in this commit order.

Milestones: 1 foundation; 2 identity and tenant isolation; 3 filings and audit; 4 registry resilience; 5 user experience and full acceptance.

## Foundation scaffold

Node.js 22 or newer. Run `npm ci`, then `npm run dev:api` and `npm run dev:web` in separate terminals. Web: http://localhost:3000; API: http://localhost:4000/health.

`npm run build` compiles both applications. Required stack dependencies are locked up front; later milestones introduce their features. No authentication or filing endpoints are exposed in this scaffold.
