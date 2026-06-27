from datetime import date, datetime
from typing import Optional
from sqlmodel import Field, Relationship, SQLModel


class Pedimento(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    pedimento_num: str
    importador: str
    tipo_cambio: float
    pdf_filename: str
    fecha_upload: datetime = Field(default_factory=datetime.utcnow)

    partidas: list["Partida"] = Relationship(back_populates="pedimento")
    facturas: list["Factura"] = Relationship(back_populates="pedimento")


class Partida(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    pedimento_id: int = Field(foreign_key="pedimento.id")
    sec: int
    fraccion: str
    descripcion: str
    cantidad: float
    val_aduana: int
    val_comercial: int
    precio_unitario: float
    tiene_incrementables: bool

    pedimento: Optional[Pedimento] = Relationship(back_populates="partidas")


class SatClave(SQLModel, table=True):
    __tablename__ = "sat_claves"
    key: str = Field(primary_key=True)
    description: str


class Producto(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    fraccion: str = Field(unique=True, index=True)
    descripcion: str
    clave_prod_serv: str
    descripcion_sat: Optional[str] = Field(default=None)
    unit_key: str = Field(default="H87")
    confidence: Optional[str] = Field(default=None)
    facturapi_id: Optional[str] = Field(default=None)


class Factura(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    facturapi_id: str = Field(index=True)
    uuid: Optional[str] = Field(default=None)
    pedimento_id: Optional[int] = Field(default=None, foreign_key="pedimento.id")
    status: str
    cancellation_status: str = Field(default="none")
    payment_method: str
    total: float
    currency: str = Field(default="MXN")
    customer_name: str
    customer_tax_id: str
    serie: Optional[str] = Field(default=None)
    folio_number: Optional[int] = Field(default=None)
    fecha: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)

    pedimento: Optional[Pedimento] = Relationship(back_populates="facturas")
    complementos: list["ComplementoPago"] = Relationship(back_populates="factura")


class ComplementoPago(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    facturapi_id: str
    uuid: Optional[str] = Field(default=None)
    factura_id: int = Field(foreign_key="factura.id")
    fecha_pago: date
    monto: float
    forma_pago: str
    tipo_cambio: Optional[float] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    factura: Optional[Factura] = Relationship(back_populates="complementos")
