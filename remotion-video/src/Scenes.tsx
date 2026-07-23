import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Series,
  useCurrentFrame,
} from "remotion";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const SCENES = [
  { id: "A01-CrowdedTextBox", duration: 120 },
  { id: "A02-PromptFormula", duration: 180 },
  { id: "B01-ManualTimestamp", duration: 150 },
  { id: "B02-StructureDisappears", duration: 150 },
  { id: "A03-VocabularyBarrier", duration: 150 },
  { id: "A04-BuiltInBlocks", duration: 120 },
  { id: "B03-BlocksAndPages", duration: 180 },
  { id: "B04-EditAndReuse", duration: 180 },
  { id: "B05-MatchingLibrary", duration: 180 },
  { id: "B06-DuplicatePage", duration: 180 },
  { id: "A05-ModularEnding", duration: 180 },
] as const;

export const MASTER_DURATION = SCENES.reduce(
  (total, scene) => total + scene.duration,
  0,
);

const C = {
  ink: "#24231F",
  muted: "#77756D",
  coral: "#F06442",
  coralSoft: "rgba(240, 100, 66, 0.14)",
  teal: "#709A9A",
  tealSoft: "rgba(112, 154, 154, 0.16)",
  paper: "rgba(250, 248, 241, 0.96)",
  line: "rgba(36, 35, 31, 0.18)",
  white: "#FFFDF8",
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const mono: CSSProperties = {
  fontFamily: '"IBM Plex Mono", "Cascadia Mono", Consolas, monospace',
  letterSpacing: "0.02em",
};

const Frame = ({
  children,
  duration,
}: {
  children: ReactNode;
  duration: number;
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        color: C.ink,
        padding: "112px 144px",
        opacity: interpolate(
          frame,
          [0, 10, duration - 14, duration - 1],
          [0, 1, 1, 0],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          },
        ),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const OverlayFrame = ({
  children,
  duration,
}: {
  children: ReactNode;
  duration: number;
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        color: C.ink,
        opacity: interpolate(
          frame,
          [0, 8, duration - 12, duration - 1],
          [0, 1, 1, 0],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          },
        ),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const CompactCallout = ({
  label,
  text,
  style,
}: {
  label: string;
  text: string;
  style?: CSSProperties;
}) => (
  <div
    style={{
      backgroundColor: C.paper,
      border: `2px solid ${C.line}`,
      borderRadius: 22,
      boxShadow: "0 18px 50px rgba(36, 35, 31, 0.09)",
      padding: "24px 28px 28px",
      width: 560,
      ...style,
    }}
  >
    <div
      style={{
        ...mono,
        color: C.coral,
        fontSize: 21,
        fontWeight: 800,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 42,
        fontWeight: 740,
        letterSpacing: "-0.035em",
        lineHeight: 1.05,
        marginTop: 12,
      }}
    >
      {text}
    </div>
  </div>
);

const Kicker = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      ...mono,
      alignItems: "center",
      color: C.coral,
      display: "flex",
      fontSize: 25,
      fontWeight: 700,
      gap: 14,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
    }}
  >
    <span
      style={{
        backgroundColor: C.coral,
        borderRadius: 999,
        display: "block",
        height: 12,
        width: 12,
      }}
    />
    {children}
  </div>
);

const Headline = ({
  children,
  size = 104,
  width = 1420,
}: {
  children: ReactNode;
  size?: number;
  width?: number;
}) => (
  <div
    style={{
      fontSize: size,
      fontWeight: 760,
      letterSpacing: "-0.055em",
      lineHeight: 0.98,
      maxWidth: width,
    }}
  >
    {children}
  </div>
);

const Chip = ({
  children,
  active = false,
  style,
}: {
  children: ReactNode;
  active?: boolean;
  style?: CSSProperties;
}) => (
  <div
    style={{
      ...mono,
      alignItems: "center",
      backgroundColor: active ? C.coral : C.paper,
      border: `2px solid ${active ? C.coral : C.line}`,
      borderRadius: 999,
      color: active ? C.white : C.ink,
      display: "inline-flex",
      fontSize: 27,
      fontWeight: 700,
      height: 58,
      padding: "0 25px",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

const Card = ({
  title,
  body,
  accent = false,
  style,
}: {
  title: string;
  body?: string;
  accent?: boolean;
  style?: CSSProperties;
}) => (
  <div
    style={{
      backgroundColor: C.paper,
      border: `2px solid ${accent ? C.coral : C.line}`,
      borderRadius: 24,
      minHeight: 172,
      padding: "28px 30px",
      ...style,
    }}
  >
    <div
      style={{
        ...mono,
        color: accent ? C.coral : C.muted,
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {title}
    </div>
    {body ? (
      <div
        style={{
          fontSize: 31,
          fontWeight: 650,
          lineHeight: 1.25,
          marginTop: 24,
        }}
      >
        {body}
      </div>
    ) : null}
  </div>
);

const Timeline = ({ progress = 1 }: { progress?: number }) => (
  <div
    style={{
      alignItems: "center",
      display: "flex",
      left: 0,
      position: "absolute",
      right: 0,
      top: 58,
    }}
  >
    <div
      style={{
        backgroundColor: C.coral,
        height: 4,
        opacity: 0.7,
        width: `${Math.max(0, progress) * 100}%`,
      }}
    />
    <div
      style={{
        backgroundColor: C.coral,
        borderRadius: 999,
        height: 18,
        marginLeft: -9,
        width: 18,
      }}
    />
  </div>
);

export const CrowdedTextBox = () => {
  const frame = useCurrentFrame();
  const labels = [
    "SUBJECT",
    "ACTION",
    "SCENE",
    "STYLE",
    "CAMERA",
    "LIGHTING",
    "AUDIO",
    "CONSTRAINTS",
  ];
  return (
    <Frame duration={120}>
      <Kicker>Existing workflow</Kicker>
      <div style={{ marginTop: 42 }}>
        <Headline size={98}>15 seconds. Multiple shots.</Headline>
        <Headline size={98}>
          One <span style={{ color: C.coral }}>crowded</span> text box.
        </Headline>
      </div>
      <div
        style={{
          border: `2px solid ${C.line}`,
          borderRadius: 28,
          bottom: 112,
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          height: 244,
          left: 144,
          overflow: "hidden",
          padding: 36,
          position: "absolute",
          right: 144,
        }}
      >
        {labels.map((label, index) => (
          <div
            key={label}
            style={{
              opacity: interpolate(frame, [30 + index * 5, 42 + index * 5], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              scale: interpolate(frame, [30 + index * 5, 48 + index * 5], [1.18, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              }),
              translate: `${interpolate(frame, [30 + index * 5, 54 + index * 5], [70 - index * 9, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              })}px 0px`,
            }}
          >
            <Chip active={index === 4}>{label}</Chip>
          </div>
        ))}
        <div
          style={{
            ...mono,
            color: C.muted,
            fontSize: 25,
            lineHeight: 1.6,
            opacity: interpolate(frame, [70, 92], [0, 0.62], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            whiteSpace: "nowrap",
          }}
        >
          [00:00–00:04] subject action scene style camera lighting audio constraints…
        </div>
      </div>
    </Frame>
  );
};

export const PromptFormula = () => {
  const frame = useCurrentFrame();
  const tokens = [
    "SUBJECT",
    "ACTION",
    "SCENE",
    "STYLE",
    "CAMERA",
    "LIGHTING",
    "TIMING",
    "AUDIO",
    "CONSTRAINTS",
  ];
  return (
    <Frame duration={180}>
      <Kicker>Prompt anatomy</Kicker>
      <div style={{ marginTop: 45 }}>
        <Headline size={92}>A single prompt has to hold everything.</Headline>
      </div>
      <div
        style={{
          alignItems: "center",
          bottom: 130,
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          left: 144,
          position: "absolute",
          right: 144,
        }}
      >
        <div style={{ ...mono, color: C.coral, fontSize: 36, fontWeight: 800 }}>
          PROMPT =
        </div>
        {tokens.map((token, index) => (
          <div
            key={token}
            style={{
              alignItems: "center",
              display: "flex",
              gap: 18,
              opacity: interpolate(frame, [35 + index * 8, 49 + index * 8], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: `0px ${interpolate(frame, [35 + index * 8, 55 + index * 8], [30, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              })}px`,
            }}
          >
            {index > 0 ? (
              <span style={{ color: C.coral, fontSize: 32, fontWeight: 800 }}>+</span>
            ) : null}
            <Chip active={token === "CAMERA"}>{token}</Chip>
          </div>
        ))}
      </div>
    </Frame>
  );
};

export const ManualTimestamp = () => {
  const frame = useCurrentFrame();
  const stamp = "[00:00–00:04]";
  const visible = stamp.slice(0, Math.floor(interpolate(frame, [24, 88], [0, stamp.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })));
  return (
    <OverlayFrame duration={150}>
      <Timeline
        progress={interpolate(frame, [15, 110], [0.05, 0.74], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
      />
      <div
        style={{
          left: 144,
          opacity: interpolate(frame, [12, 28], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          position: "absolute",
          top: 142,
          translate: `${interpolate(frame, [12, 38], [-70, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}px 0px`,
        }}
      >
        <CompactCallout
          label="Conventional interaction"
          text="Type every timestamp by hand."
        />
      </div>
      <div
        style={{
          ...mono,
          alignItems: "center",
          backgroundColor: C.paper,
          border: `2px solid ${C.line}`,
          borderRadius: 22,
          bottom: 160,
          display: "flex",
          fontSize: 58,
          fontWeight: 700,
          height: 132,
          padding: "0 36px",
          position: "absolute",
          right: 144,
          width: 620,
        }}
      >
        <span style={{ color: C.coral }}>{visible}</span>
        <span
          style={{
            backgroundColor: C.coral,
            height: 65,
            marginLeft: 9,
            opacity: Math.floor(frame / 10) % 2 === 0 ? 1 : 0,
            width: 4,
          }}
        />
      </div>
      <div
        style={{
          bottom: 112,
          display: "flex",
          gap: 12,
          left: 144,
          position: "absolute",
        }}
      >
        <Chip>MANUAL INPUT</Chip>
        <Chip active>SLOW TO REVISE</Chip>
      </div>
    </OverlayFrame>
  );
};

export const StructureDisappears = () => {
  const frame = useCurrentFrame();
  const actions = ["Find it", "Rewrite it", "Check it again"];
  return (
    <OverlayFrame duration={150}>
      <div
        style={{
          left: 144,
          opacity: interpolate(frame, [10, 28], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          position: "absolute",
          top: 130,
          translate: `${interpolate(frame, [10, 38], [-70, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}px 0px`,
        }}
      >
        <CompactCallout
          label="Second-pass editing"
          text="The structure disappears inside the text."
        />
      </div>
      <div
        style={{
          borderBottom: `4px solid ${C.coral}`,
          borderLeft: `4px solid ${C.coral}`,
          borderTop: `4px solid ${C.coral}`,
          bottom: 210,
          display: "flex",
          flexDirection: "column",
          gap: interpolate(frame, [28, 100], [24, 5], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          }),
          height: 330,
          left: 420,
          overflow: "hidden",
          padding: "34px 0 34px 34px",
          position: "absolute",
          width: 720,
        }}
      >
        {Array.from({ length: 11 }).map((_, index) => (
          <div
            key={index}
            style={{
              backgroundColor: index === 3 ? C.coral : C.ink,
              borderRadius: 99,
              height: 8,
              opacity: index === 3 ? 0.7 : 0.16,
              width: `${76 + ((index * 17) % 24)}%`,
            }}
          />
        ))}
      </div>
      <div
        style={{
          bottom: 225,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          position: "absolute",
          right: 144,
        }}
      >
        {actions.map((action, index) => (
          <div
            key={action}
            style={{
              opacity: interpolate(frame, [48 + index * 16, 62 + index * 16], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: `${interpolate(frame, [48 + index * 16, 70 + index * 16], [50, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              })}px 0px`,
            }}
          >
            <Chip active={index === 1}>{`0${index + 1}  ${action}`}</Chip>
          </div>
        ))}
      </div>
    </OverlayFrame>
  );
};

export const VocabularyBarrier = () => {
  const frame = useCurrentFrame();
  const words = ["CAMERA.", "STYLE.", "MOVEMENT."];
  return (
    <Frame duration={150}>
      <Kicker>Vocabulary barrier</Kicker>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 42 }}>
        {words.map((word, index) => (
          <div
            key={word}
            style={{
              color: index === 1 ? C.coral : C.ink,
              fontSize: 108,
              fontWeight: 800,
              letterSpacing: "-0.045em",
              lineHeight: 0.88,
              opacity: interpolate(frame, [12 + index * 10, 28 + index * 10], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: `${interpolate(frame, [12 + index * 10, 36 + index * 10], [-80, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              })}px 0px`,
            }}
          >
            {word}
          </div>
        ))}
      </div>
      <div
        style={{
          bottom: 120,
          fontSize: 46,
          fontWeight: 650,
          lineHeight: 1.18,
          maxWidth: 1170,
          position: "absolute",
        }}
      >
        Without production vocabulary, every new shot becomes{" "}
        <span
          style={{
            backgroundColor: C.coralSoft,
            borderRadius: 12,
            color: C.coral,
            padding: "2px 12px 7px",
          }}
        >
          guesswork.
        </span>
      </div>
    </Frame>
  );
};

export const BuiltInBlocks = () => {
  const frame = useCurrentFrame();
  const cards = ["SUBJECT", "ACTION", "CAMERA"];
  return (
    <Frame duration={120}>
      <Timeline
        progress={interpolate(frame, [8, 80], [0, 0.88], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
      />
      <div style={{ marginTop: 134 }}>
        <Kicker>A clearer model</Kicker>
        <div style={{ marginTop: 40 }}>
          <Headline size={106}>
            Prompts should be built in <span style={{ color: C.coral }}>blocks.</span>
          </Headline>
        </div>
      </div>
      <div
        style={{
          bottom: 105,
          display: "grid",
          gap: 22,
          gridTemplateColumns: "repeat(3, 1fr)",
          left: 144,
          position: "absolute",
          right: 144,
        }}
      >
        {cards.map((card, index) => (
          <div
            key={card}
            style={{
              opacity: interpolate(frame, [28 + index * 8, 42 + index * 8], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: `0px ${interpolate(frame, [28 + index * 8, 52 + index * 8], [120, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              })}px`,
            }}
          >
            <Card
              accent={index === 2}
              body={index === 0 ? "The young swordsman" : index === 1 ? "Raises his guard" : "Tight close-up"}
              title={card}
            />
          </div>
        ))}
      </div>
    </Frame>
  );
};

export const BlocksAndPages = () => {
  const frame = useCurrentFrame();
  return (
    <OverlayFrame duration={180}>
      <div
        style={{
          left: 144,
          opacity: interpolate(frame, [12, 28], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          position: "absolute",
          top: 130,
          translate: `${interpolate(frame, [12, 40], [-70, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}px 0px`,
        }}
      >
        <CompactCallout
          label="Our interface"
          text="Prompt blocks + timestamped pages"
        />
      </div>
      <div
        style={{
          bottom: 120,
          display: "flex",
          gap: 18,
          left: 144,
          position: "absolute",
        }}
      >
        {["00:00–00:04", "00:04–00:08", "00:08–00:12"].map((stamp, index) => (
          <div
            key={stamp}
            style={{
              opacity: interpolate(frame, [36 + index * 12, 50 + index * 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: `${interpolate(frame, [36 + index * 12, 60 + index * 12], [-50, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              })}px 0px`,
            }}
          >
            <Chip active={index === 0}>{stamp}</Chip>
          </div>
        ))}
      </div>
      <div
        style={{
          bottom: 116,
          display: "grid",
          gap: 18,
          gridTemplateColumns: "repeat(2, 300px)",
          position: "absolute",
          right: 144,
        }}
      >
        {["SUBJECT", "ACTION", "STYLE", "CAMERA"].map((title, index) => (
          <div
            key={title}
            style={{
              opacity: interpolate(frame, [60 + index * 8, 74 + index * 8], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              scale: interpolate(frame, [60 + index * 8, 82 + index * 8], [0.88, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              }),
            }}
          >
            <Card accent={title === "CAMERA"} title={title} />
          </div>
        ))}
      </div>
    </OverlayFrame>
  );
};

export const EditAndReuse = () => {
  const frame = useCurrentFrame();
  const benefits = ["See every segment.", "Edit any part.", "Reuse what works."];
  return (
    <OverlayFrame duration={180}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          position: "absolute",
          right: 144,
          top: 150,
          width: 760,
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <Kicker>Stay in control</Kicker>
        </div>
        {benefits.map((benefit, index) => (
          <div
            key={benefit}
            style={{
              alignItems: "center",
              backgroundColor: C.paper,
              border: `2px solid ${index === 1 ? C.coral : C.line}`,
              borderRadius: 22,
              display: "flex",
              gap: 24,
              opacity: interpolate(frame, [18 + index * 22, 34 + index * 22], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              padding: "20px 24px",
              translate: `${interpolate(frame, [18 + index * 22, 44 + index * 22], [-90, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              })}px 0px`,
            }}
          >
            <div
              style={{
                ...mono,
                alignItems: "center",
                backgroundColor: index === 1 ? C.coral : C.paper,
                border: `2px solid ${index === 1 ? C.coral : C.line}`,
                borderRadius: 999,
                color: index === 1 ? C.white : C.coral,
                display: "flex",
                fontSize: 28,
                fontWeight: 800,
                height: 70,
                justifyContent: "center",
                width: 70,
              }}
            >
              0{index + 1}
            </div>
            <div
              style={{
                fontSize: 50,
                fontWeight: 760,
                letterSpacing: "-0.05em",
              }}
            >
              {benefit}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          backgroundColor: C.coral,
          bottom: 118,
          height: 5,
          right: 144,
          position: "absolute",
          width: `${interpolate(frame, [80, 135], [0, 68], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}%`,
        }}
      />
    </OverlayFrame>
  );
};

export const MatchingLibrary = () => {
  const frame = useCurrentFrame();
  const suggestions = ["Tight close-up", "Slow push-in", "Orbital tracking"];
  return (
    <OverlayFrame duration={180}>
      <div
        style={{
          left: 144,
          opacity: interpolate(frame, [10, 28], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          position: "absolute",
          top: 126,
          translate: `${interpolate(frame, [10, 38], [-70, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}px 0px`,
        }}
      >
        <CompactCallout
          label="Matching prompt library"
          text="Every block opens the right starting point."
        />
      </div>
      <div
        style={{
          bottom: 112,
          display: "grid",
          gap: 120,
          gridTemplateColumns: "520px 620px",
          left: 250,
          position: "absolute",
        }}
      >
        <div
          style={{
            opacity: interpolate(frame, [24, 42], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: `${interpolate(frame, [24, 52], [-70, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            })}px 0px`,
          }}
        >
          <Card accent body="Tight close-up, intense gaze" title="CAMERA" />
          <div
            style={{
              ...mono,
              color: C.coral,
              fontSize: 24,
              fontWeight: 700,
              marginTop: 18,
              textAlign: "center",
            }}
          >
            CURRENT BLOCK
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              style={{
                opacity: interpolate(frame, [50 + index * 12, 66 + index * 12], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                translate: `${interpolate(frame, [50 + index * 12, 78 + index * 12], [90, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: ease,
                })}px 0px`,
              }}
            >
              <Card
                accent={index === 0}
                body={index === 0 ? "Start close. Rewrite fast." : "Similar camera language"}
                title={suggestion}
              />
            </div>
          ))}
        </div>
      </div>
      <svg
        height="120"
        style={{ bottom: 280, left: 735, overflow: "visible", position: "absolute" }}
        width="160"
      >
        <path
          d="M0 60 C50 60 80 60 150 60"
          fill="none"
          opacity={interpolate(frame, [40, 72], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          stroke={C.coral}
          strokeDasharray="8 10"
          strokeWidth="4"
        />
      </svg>
    </OverlayFrame>
  );
};

export const DuplicatePage = () => {
  const frame = useCurrentFrame();
  const pageOneX = interpolate(frame, [45, 82], [280, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const pageTwoX = interpolate(frame, [45, 82], [-280, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  return (
    <OverlayFrame duration={180}>
      <div
        style={{
          left: 144,
          opacity: interpolate(frame, [10, 28], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          position: "absolute",
          top: 128,
          translate: `${interpolate(frame, [10, 38], [-70, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}px 0px`,
        }}
      >
        <CompactCallout
          label="Build the next segment"
          text="Duplicate the page. Change only what changes."
          style={{ width: 620 }}
        />
      </div>
      <div
        style={{
          bottom: 105,
          display: "grid",
          gap: 42,
          gridTemplateColumns: "1fr 1fr",
          left: 144,
          position: "absolute",
          right: 144,
        }}
      >
        {[0, 1].map((page) => (
          <div
            key={page}
            style={{
              backgroundColor: C.paper,
              border: `2px solid ${page === 1 ? C.coral : C.line}`,
              borderRadius: 28,
              opacity: page === 0 ? 1 : interpolate(frame, [44, 62], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              padding: 26,
              translate: `${page === 0 ? pageOneX : pageTwoX}px 0px`,
            }}
          >
            <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
              <Chip active={page === 1}>{page === 0 ? "00:00–00:04" : "00:04–00:08"}</Chip>
              <div style={{ ...mono, color: C.muted, fontSize: 22, fontWeight: 700 }}>
                PAGE {page + 1}
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gap: 13,
                gridTemplateColumns: "repeat(3, 1fr)",
                marginTop: 22,
              }}
            >
              {["SUBJECT", "ACTION", "CAMERA"].map((title) => (
                <Card
                  key={title}
                  accent={page === 1 && title !== "SUBJECT"}
                  body={page === 1 && title === "ACTION" ? "Strikes forward" : page === 1 && title === "CAMERA" ? "Tracking shot" : "Reused"}
                  style={{ minHeight: 155, padding: 20 }}
                  title={title}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </OverlayFrame>
  );
};

export const ModularEnding = () => {
  const frame = useCurrentFrame();
  return (
    <Frame duration={180}>
      <Timeline
        progress={interpolate(frame, [10, 105], [0.02, 0.95], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
      />
      <div style={{ marginTop: 130 }}>
        <Kicker>The result</Kicker>
        <div style={{ marginTop: 38 }}>
          <Headline size={108}>Long prompts stay modular.</Headline>
          <Headline size={108}>
            Every segment stays <span style={{ color: C.coral }}>editable.</span>
          </Headline>
        </div>
      </div>
      <div
        style={{
          bottom: 122,
          display: "flex",
          gap: 14,
          left: 144,
          position: "absolute",
        }}
      >
        {["00:00–00:04", "00:04–00:08", "00:08–00:12", "00:12–00:15"].map(
          (stamp, index) => (
            <div
              key={stamp}
              style={{
                opacity: interpolate(frame, [55 + index * 10, 69 + index * 10], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                translate: `0px ${interpolate(frame, [55 + index * 10, 78 + index * 10], [45, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: ease,
                })}px`,
              }}
            >
              <Chip active={index === 3}>{stamp}</Chip>
            </div>
          ),
        )}
      </div>
      <div
        style={{
          ...mono,
          bottom: 225,
          color: C.muted,
          fontSize: 27,
          fontWeight: 700,
          position: "absolute",
          right: 144,
        }}
      >
        BUILD THE NEXT SHOT — NOT THE WHOLE PROMPT AGAIN.
      </div>
    </Frame>
  );
};

export const ReviewBackground = () => (
  <AbsoluteFill
    style={{
      backgroundColor: "#F1EEE5",
      backgroundImage:
        "radial-gradient(rgba(36,35,31,0.12) 1.5px, transparent 1.5px)",
      backgroundPosition: "0 0",
      backgroundSize: "34px 34px",
    }}
  />
);

const OverlayDemoBackdrop = ({ sceneId }: { sceneId: string }) => (
  <AbsoluteFill style={{ backgroundColor: "#D8D5CD", padding: 72 }}>
    <div
      style={{
        backgroundColor: "#F7F5EE",
        border: "2px solid rgba(36,35,31,0.18)",
        borderRadius: 28,
        boxShadow: "0 35px 90px rgba(36,35,31,0.16)",
        display: "grid",
        gridTemplateRows: "76px 1fr",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          alignItems: "center",
          borderBottom: "2px solid rgba(36,35,31,0.1)",
          display: "flex",
          gap: 12,
          padding: "0 28px",
        }}
      >
        {[C.coral, "#E7BE63", C.teal].map((color) => (
          <div
            key={color}
            style={{ backgroundColor: color, borderRadius: 999, height: 13, width: 13 }}
          />
        ))}
        <div
          style={{
            ...mono,
            color: C.muted,
            fontSize: 20,
            fontWeight: 700,
            marginLeft: 18,
          }}
        >
          EDITOR FOOTAGE PLACEHOLDER
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 460px" }}>
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(3, 1fr)", padding: 42 }}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              style={{
                backgroundColor: index === 4 ? C.coralSoft : "rgba(255,255,255,0.5)",
                border: `2px solid ${index === 4 ? "rgba(240,100,66,0.32)" : "rgba(36,35,31,0.08)"}`,
                borderRadius: 20,
              }}
            />
          ))}
        </div>
        <div
          style={{
            backgroundColor: "rgba(255,255,255,0.42)",
            borderLeft: "2px solid rgba(36,35,31,0.08)",
            padding: 34,
          }}
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              style={{
                backgroundColor: "rgba(36,35,31,0.07)",
                borderRadius: 12,
                height: 84,
                marginBottom: 18,
              }}
            />
          ))}
        </div>
      </div>
    </div>
    <div
      style={{
        ...mono,
        backgroundColor: C.ink,
        borderRadius: 999,
        bottom: 26,
        color: C.white,
        fontSize: 18,
        fontWeight: 800,
        left: 50,
        letterSpacing: "0.08em",
        padding: "12px 18px",
        position: "absolute",
      }}
    >
      {sceneId} · DEMO BACKDROP IS NOT INCLUDED IN ALPHA EXPORT
    </div>
  </AbsoluteFill>
);

const OverlayDemoScene = ({
  children,
  sceneId,
}: {
  children: ReactNode;
  sceneId: string;
}) => (
  <AbsoluteFill>
    <OverlayDemoBackdrop sceneId={sceneId} />
    {children}
  </AbsoluteFill>
);

export const OVERLAY_SHOWCASE_DURATION = 1020;

export const OverlayShowcase = () => (
  <AbsoluteFill>
    <Series>
      <Series.Sequence durationInFrames={150} premountFor={FPS}>
        <OverlayDemoScene sceneId="B01 Manual timestamp">
          <ManualTimestamp />
        </OverlayDemoScene>
      </Series.Sequence>
      <Series.Sequence durationInFrames={150} premountFor={FPS}>
        <OverlayDemoScene sceneId="B02 Structure disappears">
          <StructureDisappears />
        </OverlayDemoScene>
      </Series.Sequence>
      <Series.Sequence durationInFrames={180} premountFor={FPS}>
        <OverlayDemoScene sceneId="B03 Blocks and pages">
          <BlocksAndPages />
        </OverlayDemoScene>
      </Series.Sequence>
      <Series.Sequence durationInFrames={180} premountFor={FPS}>
        <OverlayDemoScene sceneId="B04 Edit and reuse">
          <EditAndReuse />
        </OverlayDemoScene>
      </Series.Sequence>
      <Series.Sequence durationInFrames={180} premountFor={FPS}>
        <OverlayDemoScene sceneId="B05 Matching library">
          <MatchingLibrary />
        </OverlayDemoScene>
      </Series.Sequence>
      <Series.Sequence durationInFrames={180} premountFor={FPS}>
        <OverlayDemoScene sceneId="B06 Duplicate page">
          <DuplicatePage />
        </OverlayDemoScene>
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);

export const MasterSequence = ({ review = false }: { review?: boolean }) => (
  <AbsoluteFill>
    {review ? <ReviewBackground /> : null}
    <Series>
      <Series.Sequence durationInFrames={120} premountFor={FPS}>
        <CrowdedTextBox />
      </Series.Sequence>
      <Series.Sequence durationInFrames={180} premountFor={FPS}>
        <PromptFormula />
      </Series.Sequence>
      <Series.Sequence durationInFrames={150} premountFor={FPS}>
        <ManualTimestamp />
      </Series.Sequence>
      <Series.Sequence durationInFrames={150} premountFor={FPS}>
        <StructureDisappears />
      </Series.Sequence>
      <Series.Sequence durationInFrames={150} premountFor={FPS}>
        <VocabularyBarrier />
      </Series.Sequence>
      <Series.Sequence durationInFrames={120} premountFor={FPS}>
        <BuiltInBlocks />
      </Series.Sequence>
      <Series.Sequence durationInFrames={180} premountFor={FPS}>
        <BlocksAndPages />
      </Series.Sequence>
      <Series.Sequence durationInFrames={180} premountFor={FPS}>
        <EditAndReuse />
      </Series.Sequence>
      <Series.Sequence durationInFrames={180} premountFor={FPS}>
        <MatchingLibrary />
      </Series.Sequence>
      <Series.Sequence durationInFrames={180} premountFor={FPS}>
        <DuplicatePage />
      </Series.Sequence>
      <Series.Sequence durationInFrames={180} premountFor={FPS}>
        <ModularEnding />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);
