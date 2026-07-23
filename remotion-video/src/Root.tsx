import "./index.css";
import { Composition, Folder } from "remotion";
import {
  BlocksAndPages,
  BuiltInBlocks,
  CrowdedTextBox,
  DuplicatePage,
  EditAndReuse,
  FPS,
  HEIGHT,
  ManualTimestamp,
  MASTER_DURATION,
  MasterSequence,
  MatchingLibrary,
  ModularEnding,
  OVERLAY_SHOWCASE_DURATION,
  OverlayShowcase,
  PromptFormula,
  StructureDisappears,
  VocabularyBarrier,
  WIDTH,
} from "./Scenes";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Master">
        <Composition
          id="MasterReview"
          component={() => <MasterSequence review />}
          durationInFrames={MASTER_DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="MasterAlpha"
          component={MasterSequence}
          durationInFrames={MASTER_DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
          defaultProps={{ review: false }}
        />
        <Composition
          id="OverlayShowcase"
          component={OverlayShowcase}
          durationInFrames={OVERLAY_SHOWCASE_DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
      </Folder>
      <Folder name="A-Fullscreen">
        <Composition id="A01-CrowdedTextBox" component={CrowdedTextBox} durationInFrames={120} fps={FPS} width={WIDTH} height={HEIGHT} />
        <Composition id="A02-PromptFormula" component={PromptFormula} durationInFrames={180} fps={FPS} width={WIDTH} height={HEIGHT} />
        <Composition id="A03-VocabularyBarrier" component={VocabularyBarrier} durationInFrames={150} fps={FPS} width={WIDTH} height={HEIGHT} />
        <Composition id="A04-BuiltInBlocks" component={BuiltInBlocks} durationInFrames={120} fps={FPS} width={WIDTH} height={HEIGHT} />
        <Composition id="A05-ModularEnding" component={ModularEnding} durationInFrames={180} fps={FPS} width={WIDTH} height={HEIGHT} />
      </Folder>
      <Folder name="B-Overlay">
        <Composition id="B01-ManualTimestamp" component={ManualTimestamp} durationInFrames={150} fps={FPS} width={WIDTH} height={HEIGHT} />
        <Composition id="B02-StructureDisappears" component={StructureDisappears} durationInFrames={150} fps={FPS} width={WIDTH} height={HEIGHT} />
        <Composition id="B03-BlocksAndPages" component={BlocksAndPages} durationInFrames={180} fps={FPS} width={WIDTH} height={HEIGHT} />
        <Composition id="B04-EditAndReuse" component={EditAndReuse} durationInFrames={180} fps={FPS} width={WIDTH} height={HEIGHT} />
        <Composition id="B05-MatchingLibrary" component={MatchingLibrary} durationInFrames={180} fps={FPS} width={WIDTH} height={HEIGHT} />
        <Composition id="B06-DuplicatePage" component={DuplicatePage} durationInFrames={180} fps={FPS} width={WIDTH} height={HEIGHT} />
      </Folder>
    </>
  );
};
