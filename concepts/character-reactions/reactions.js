export const REACTIONS = {
  wave: {
    label: "hello",
    key: "1",
    clips: [
      {
        file: "hello-alpha.webm",
        start: 0,
        alpha: true,
        lines: ["oh hey 👋", "hiii"],
      },
    ],
  },
  heart: {
    label: "finger heart",
    key: "2",
    clips: [
      {
        file: "heart-2.mp4",
        start: 0,
        lines: ["right back at you 🫶", "for you 🫰"],
      },
      { file: "heart-1.mp4", start: 0, lines: ["stop 😭", "i’m blushing"] },
    ],
  },
  surprise: {
    label: "surprise",
    key: "3",
    clips: [
      { file: "surprise-1.mp4", start: 0, lines: ["wait WHAT", "no way 😭"] },
      {
        file: "surprise-2.mp4",
        start: 0,
        lines: ["did you see that?", "hello?? 👀"],
      },
    ],
  },
  middle: {
    label: "attitude",
    key: "4",
    clips: [
      {
        file: "middle-1.mp4",
        start: 0,
        lines: ["matching your energy 💀", "two can play"],
      },
      { file: "middle-2.mp4", start: 0, lines: ["💀", "anyway… 💅"] },
    ],
  },
};
