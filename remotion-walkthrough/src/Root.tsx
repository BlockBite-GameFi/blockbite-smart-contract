import { Composition } from "remotion";
import { Walkthrough } from "./Walkthrough";

const FPS = 30;
const DURATION_SECONDS = 28;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Walkthrough"
      component={Walkthrough}
      durationInFrames={FPS * DURATION_SECONDS}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
