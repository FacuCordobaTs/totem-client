import type { TransportManifestResponse } from "@/types/api"

export type DriverManifestState = {
  manifest: TransportManifestResponse
  updatedAt: string
}

export function driverStorageKey(token: string) {
  return `crow_driver_manifest_v2:${token}`
}

export function boardingCount(passenger: TransportManifestResponse["passengers"][number]) {
  return passenger.status === "USED" ? passenger.quantity : 0
}

export function readDriverState(token: string): DriverManifestState | null {
  try {
    const raw = localStorage.getItem(driverStorageKey(token))
    if (!raw) return null
    const state = JSON.parse(raw) as DriverManifestState
    const m = state?.manifest
    if (
      !m ||
      typeof m.event?.id !== "string" ||
      typeof m.event?.name !== "string" ||
      typeof m.transport?.id !== "string" ||
      typeof m.transport?.name !== "string" ||
      typeof m.transport?.address !== "string" ||
      !Array.isArray(m.passengers) ||
      typeof state.updatedAt !== "string"
    )
      return null
    if (
      !m.passengers.every(
        (p) =>
          p &&
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          Number.isInteger(p.quantity) &&
          p.quantity === 1 &&
          (p.status === "PENDING" || p.status === "USED") &&
          (p.dni === null || typeof p.dni === "string") &&
          (p.phone === null || typeof p.phone === "string")
      )
    )
      return null
    return { manifest: state.manifest, updatedAt: state.updatedAt }
  } catch {
    return null
  }
}

export function matchesPassenger(
  passenger: TransportManifestResponse["passengers"][number],
  query: string
) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
  const search = normalize(query)
  if (!search) return true
  if (
    normalize(
      `${passenger.name} ${passenger.dni ?? ""} ${passenger.phone ?? ""}`
    ).includes(search)
  )
    return true
  const digits = search.replace(/\D/g, "")
  return (
    digits.length > 0 &&
    /^[\d\s+().-]+$/.test(search) &&
    `${passenger.dni ?? ""} ${passenger.phone ?? ""}`
      .replace(/\D/g, "")
      .includes(digits)
  )
}
