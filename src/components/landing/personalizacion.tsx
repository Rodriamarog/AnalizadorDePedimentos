export function Personalizacion() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-14 md:px-10 md:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Hecho a tu medida</span>
        <h2 className="mt-3 font-sans text-2xl font-black text-foreground md:text-3xl">
          Cada comercializadora factura distinto — tu parser también debería.
        </h2>
        <p className="mt-3 text-sm text-muted-foreground md:text-base">
          Tus pedimentos y facturas no se estructuran igual que los de nadie más, así que no
          usamos un parser genérico: lo ajustamos a tus documentos. Una vez que tengas tu cuenta
          lista, solo necesitamos que nos compartas algunos ejemplos.
        </p>
        <p className="mt-5 inline-block rounded-md border border-primary/30 bg-primary/5 px-4 py-2 font-mono text-xs text-primary">
          Solo necesitamos unos ejemplos de tus pedimentos y/o facturas
        </p>
      </div>
    </section>
  );
}
