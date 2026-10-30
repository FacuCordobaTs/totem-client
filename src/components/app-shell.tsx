import type { ReactNode } from "react"
import { CheckoutIdentitySheet } from "@/components/checkout-identity-sheet"

/**
 * Global canvas: pure black base, grouped surfaces use bg-[#1C1C1E] on individual pages.
 * El drawer de identidad vive acá para que cualquier tienda (Crow o página propia del evento)
 * pueda pedir nombre y DNI antes del checkout sin duplicar el formulario.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-black font-sans text-white antialiased selection:bg-white/15">
      {children}
      <CheckoutIdentitySheet />
    </div>
  )
}
