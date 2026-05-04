import type { StolowApi } from "../shared/types";

declare global {
  interface Window {
    stolow: StolowApi;
  }
}

export {};
