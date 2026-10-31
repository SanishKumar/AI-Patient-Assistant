import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export function vaultKey() {
  const raw = process.env.AETHER_DATA_KEY ?? ''
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32 || key.toString('base64') !== raw)
    throw new Error('AETHER_DATA_KEY must be a base64-encoded 32-byte key')
  return key
}
export function seal(plaintext, context) {
  return sealBytes(Buffer.from(plaintext, 'utf8'), context)
}
export function sealBytes(plaintext, context) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', vaultKey(), nonce)
  cipher.setAAD(Buffer.from(context))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return [
    'v1',
    nonce.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join('.')
}
export function unseal(value, context) {
  return unsealBytes(value, context).toString('utf8')
}
export function unsealBytes(value, context) {
  const [version, nonce, tag, ciphertext, extra] = value.split('.')
  if (version !== 'v1' || !nonce || !tag || !ciphertext || extra !== undefined)
    throw new Error('Invalid encrypted payload')
  const decipher = createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(nonce, 'base64'))
  decipher.setAAD(Buffer.from(context))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()])
}
