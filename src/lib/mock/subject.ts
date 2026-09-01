import type { Subject } from "./types";

export const demoSubject: Subject = {
  address: "0x9f2c4418b6a14e3a4a1b72c0e8d91f4a1b9c4a1b",
  displayAddress: "0x9f2c…4a1b",
  network: "creditcoin",
  connected: true,
  signed: true,
};

export const unsupportedSubject: Subject = {
  ...demoSubject,
  network: "unsupported",
  signed: false,
};
