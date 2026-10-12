import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { boardingCount, driverStorageKey, matchesPassenger, readDriverState, type DriverManifestState } from "../src/lib/transport-boarding"

const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
let values: Map<string, string>
beforeEach(() => { values = new Map(); Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } }) })
afterEach(() => { if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor); else Reflect.deleteProperty(globalThis, "localStorage") })
const state: DriverManifestState = {
  manifest: { event: { id: "event-a", name: "Fiesta", date: "2026-12-01" }, transport: { id: "transport-a", name: "Salida", address: "Dirección", latitude: "-31.6", longitude: "-60.7" }, passengers: [{ id: "booking-a", name: "María López", dni: "12345678", phone: "+54 341 555 0000", quantity: 1, status: "USED", boardedAt: "2026-10-12T18:00:00Z" }] },
  updatedAt: "2026-10-12T18:00:00Z"
}
describe("copia del listado oficial del chofer", () => {
  test("conserva la copia del servidor y descarta marcas locales antiguas", () => {
    localStorage.setItem(driverStorageKey("link-a"), JSON.stringify({ ...state, boarded: { "booking-a": 0 } }))
    expect(readDriverState("link-a")).toEqual(state)
    expect(readDriverState("link-b")).toBeNull()
  })
  test("cuenta solamente las subidas registradas en el servidor", () => {
    expect(boardingCount(state.manifest.passengers[0])).toBe(1)
    expect(boardingCount({ ...state.manifest.passengers[0], status: "PENDING" })).toBe(0)
  })
  test("busca nombres sin tildes, DNI y celulares sin separadores", () => {
    const passenger = state.manifest.passengers[0]
    expect(matchesPassenger(passenger, "maria lopez")).toBe(true)
    expect(matchesPassenger(passenger, "123456")).toBe(true)
    expect(matchesPassenger(passenger, "341555")).toBe(true)
    expect(matchesPassenger(passenger, "Beto")).toBe(false)
  })
  test("tolera un almacenamiento corrupto sin perder la página", () => {
    localStorage.setItem(driverStorageKey("link-a"), "{broken")
    expect(readDriverState("link-a")).toBeNull()
    localStorage.setItem(driverStorageKey("link-a"), JSON.stringify({ ...state, manifest: { ...state.manifest, passengers: [{ name: "Ana" }] } }))
    expect(readDriverState("link-a")).toBeNull()
  })
})
