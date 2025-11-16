declare module "lzma-native" {
  export function decompress(
    input: Buffer | Uint8Array,
    cb: (result: Buffer | Uint8Array) => void
  ): void;
}
