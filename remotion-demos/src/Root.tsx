import "./style.css";
import { Composition } from "remotion";
import { Subida } from "./compositions/Subida";
import { Extraccion } from "./compositions/Extraccion";
import { GenerarFactura } from "./compositions/GenerarFactura";
import { FacturaLista } from "./compositions/FacturaLista";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="Subida"
        component={Subida}
        durationInFrames={FPS * 6}
        fps={FPS}
        width={1080}
        height={1080}
      />
      <Composition
        id="Extraccion"
        component={Extraccion}
        durationInFrames={FPS * 9}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="GenerarFactura"
        component={GenerarFactura}
        durationInFrames={FPS * 7}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="FacturaLista"
        component={FacturaLista}
        durationInFrames={FPS * 5}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
