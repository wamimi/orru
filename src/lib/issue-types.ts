import type { Hex } from "viem";

export type ProofBundle = {
  subject: `0x${string}`;
  evidencePayer: `0x${string}`;
  band: number;
  periods: string[];
  commitments: Hex[];
  proof: Hex;
  publicInputs: Hex[];
};
