"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings, Loader2, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ConfiguracionPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/facturapi-key");
    if (res.ok) setConfigured((await res.json()).configured);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleSave() {
    setError(null);
    setSaved(false);
    if (!apiKey.trim()) {
      setError("Ingresa una llave de API");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/facturapi-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar");
        return;
      }
      setConfigured(true);
      setApiKey("");
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto max-w-lg">
      <PageHeader title="Configuración" description="Integración con FacturAPI" icon={Settings} />

      <Card className="border-border shadow-none">
        <CardContent className="p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">Llave de FacturAPI</p>
            {configured && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Configurada
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Se usa para emitir facturas, complementos de pago, y gestionar clientes a través de
            FacturAPI. La llave se guarda cifrada y nunca se muestra de nuevo una vez guardada.
          </p>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={configured ? "sk_live_… (reemplazar llave existente)" : "sk_live_…"}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          {saved && <p className="text-xs text-emerald-700">Llave guardada correctamente.</p>}
          <div>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
