import { StrictMode, useEffect, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { createBrowserRouter, Navigate } from "react-router"
import { RouterProvider } from "react-router/dom"
import { EventDetailPage } from "@/pages/event-detail-page"
import { CheckoutPage } from "@/pages/checkout-page"
import { ReceiptPage } from "@/pages/receipt-page"
import { QrPage } from "@/pages/qr-page"
import { EventLinkHintPage } from "@/pages/event-link-hint-page"

function NightRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark")
    document.documentElement.style.colorScheme = "dark"
    return () => {
      document.documentElement.classList.remove("dark")
      document.documentElement.style.colorScheme = ""
    }
  }, [])
  return <>{children}</>
}

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <NightRoot>
        <EventLinkHintPage />
      </NightRoot>
    ),
  },
  {
    path: "/e/:eventId",
    element: (
      <NightRoot>
        <EventDetailPage />
      </NightRoot>
    ),
  },
  {
    path: "/checkout/:eventId",
    element: (
      <NightRoot>
        <CheckoutPage />
      </NightRoot>
    ),
  },
  {
    path: "/receipt/:receiptToken",
    element: (
      <NightRoot>
        <ReceiptPage />
      </NightRoot>
    ),
  },
  {
    path: "/qr/:hash",
    element: (
      <NightRoot>
        <QrPage />
      </NightRoot>
    ),
  },
  { path: "*", element: <Navigate to="/" replace /> },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
