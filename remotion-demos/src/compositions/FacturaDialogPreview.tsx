import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SatComboBox } from "@/components/sat-combobox";
import { FAKE_CLIENTES, FAKE_PARTIDAS } from "../fixtures";

// A static, non-portal recreation of CrearFacturaDialog's visual layout for
// use inside Remotion: base-ui's Dialog primitive portals through a
// floating-ui container that doesn't size/position correctly in Remotion's
// headless render (confirmed via DOM inspection — content mounts with
// data-open set and correct classes, but the portal container collapses to
// zero size), so interactivity is stripped and the real inner building
// blocks (Button, Input, SatComboBox) are arranged directly in the exact
// same classes CrearFacturaDialog uses, driven by static/animated props
// instead of internal state.
export function FacturaDialogPreview({
  saving,
  saved,
}: {
  saving?: boolean;
  saved?: boolean;
}) {
  return (
    <div className="fixed top-1/2 left-1/2 z-50 grid w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10">
      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-base leading-none font-medium">Crear factura</h2>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Cliente</label>
          <select
            className="w-full rounded-md border border-input px-3 py-2 text-sm"
            value={FAKE_CLIENTES[0].id}
            readOnly
          >
            <option>
              {FAKE_CLIENTES[0].legal_name} ({FAKE_CLIENTES[0].tax_id})
            </option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Uso del CFDI</label>
          <select className="w-full rounded-md border border-input px-3 py-2 text-sm" value="G01" readOnly>
            <option>G01 – Adquisición de mercancias</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Partidas a facturar</label>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="w-8 px-2 py-2">
                    <input type="checkbox" checked readOnly />
                  </th>
                  <th className="text-left px-2 py-2 font-semibold">Descripción</th>
                  <th className="text-right px-2 py-2 font-semibold w-16">Cant.</th>
                  <th className="text-right px-2 py-2 font-semibold w-24">Precio (MXN)</th>
                  <th className="text-left px-2 py-2 font-semibold w-32">ClaveProdServ</th>
                  <th className="text-left px-2 py-2 font-semibold w-20">Unidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {FAKE_PARTIDAS.map((p) => (
                  <tr key={p.fraccion}>
                    <td className="px-2 py-1.5 align-middle">
                      <input type="checkbox" checked readOnly />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-7 text-xs min-w-[220px]" value={p.descripcion} readOnly />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-7 text-xs text-right" value={p.cantidad} readOnly />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-7 text-xs text-right" value={p.precioUnitario.toFixed(2)} readOnly />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <SatComboBox
                          endpoint="/api/catalogs/products"
                          value={p.claveProdServ}
                          description={p.descripcionSat}
                          hideDescription
                          mapped
                          confidence={p.confidence}
                          onSelect={() => {}}
                        />
                        {!p.claveProdServ && (
                          <TriangleAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <SatComboBox
                        endpoint="/api/catalogs/units"
                        value={p.unitKey}
                        mapped
                        hideDescription
                        onSelect={() => {}}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Método de pago</label>
            <div className="flex gap-1.5 mt-1">
              <Button size="sm" className="h-8 px-3 text-xs flex-1">
                PUE
              </Button>
              <Button size="sm" variant="outline" className="h-8 px-3 text-xs flex-1">
                PPD
              </Button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tasa IVA</label>
            <div className="flex gap-1.5 mt-1">
              <Button size="sm" className="h-8 px-3 text-xs flex-1">
                16%
              </Button>
              <Button size="sm" variant="outline" className="h-8 px-3 text-xs flex-1">
                8%
              </Button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Moneda</label>
            <div className="flex gap-1.5 mt-1">
              <Button size="sm" className="h-8 px-3 text-xs flex-1">
                MXN
              </Button>
              <Button size="sm" variant="outline" className="h-8 px-3 text-xs flex-1">
                USD
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
        <Button variant="outline" size="sm">
          Cancelar
        </Button>
        <Button variant="outline" size="sm">
          Vista previa PDF
        </Button>
        <Button size="sm" disabled={saving} id="timbrar-btn">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
          {saved ? "¡Timbrada!" : saving ? "Timbrando..." : "Timbrar factura"}
        </Button>
      </div>
    </div>
  );
}
