export function vaultKey(): Buffer
export function seal(plaintext: string, context: string): string
export function unseal(value: string, context: string): string
export function sealBytes(plaintext: Uint8Array, context: string): string
export function unsealBytes(value: string, context: string): Buffer
