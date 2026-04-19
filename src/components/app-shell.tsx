import type { ReactNode } from "react"

/**
 * Global canvas: pure black base, grouped surfaces use bg-[#1C1C1E] on individual pages.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-black font-sans text-white antialiased selection:bg-white/15">
      {children}
    </div>
  )
}
