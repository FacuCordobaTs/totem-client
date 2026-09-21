# Crow Client

Aplicación React/Vite mobile-first para tienda pública, checkout, comprobantes, QRs, retiros, invitaciones y perfil del cliente.

## Entry points

- Router y providers: `src/main.tsx`.
- Cliente HTTP: `src/lib/api.ts`.
- Tienda: `src/pages/event-detail-page.tsx`.
- Checkout/receipt: `src/pages/checkout-page.tsx`, `src/pages/receipt-page.tsx`.

## Comandos

```bash
bun install
bun run dev
bun run build
bun run lint
```

`src/App.tsx` y los assets iniciales de Vite no son el entry point actual. Consultá `../AGENTS.md` y `../docs/CHECKOUT_PAYMENTS_AND_BALANCE.md` para los flujos e invariantes del backend.
