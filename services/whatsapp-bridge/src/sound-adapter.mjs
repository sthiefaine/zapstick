// Experimental wire-format adapter, isolated from the normal sticker path.
// Investigated against Baileys 7.0.0-rc14 and the field-26 demonstration at:
// github.com/DavidRamirez206/whatsapp-sound-sticker-bot/commit/d70e1784f4ad563fcc8d91925f811aad4d097f01
// A successful encoding is not evidence of native playback on a phone.
const INSTALLATION = Symbol.for('zapstick.sticker-audio.v1');
const AUDIO_TAG = (26 << 3) | 2;

export function installSoundStickerEncoder(proto) {
  const schema = proto.Message.StickerMessage;
  if (schema.encode[INSTALLATION]) return schema.encode[INSTALLATION];
  const bindings = new WeakMap(), original = schema.encode;
  function encode(message, writer) {
    const result = original.call(this, message, writer);
    const audio = message && bindings.get(message);
    if (audio) result.uint32(AUDIO_TAG).bytes(audio);
    return result;
  }
  const installation = {
    attach(sticker, audioBytes) {
      if (!sticker || typeof sticker !== 'object' || !audioBytes?.length) throw new Error('Invalid sound sticker binding.');
      if (bindings.has(sticker)) throw new Error('Sound sticker is already bound.');
      bindings.set(sticker, Buffer.from(audioBytes));
      return () => bindings.delete(sticker);
    }
  };
  Object.defineProperty(encode, INSTALLATION, { value: installation });
  schema.encode = encode;
  return installation;
}

function varint(bytes, cursor) {
  let value = 0, shift = 0;
  for (let count = 0; count < 10; count++) {
    if (cursor.at >= bytes.length) throw new Error('Truncated protobuf.');
    const byte = bytes[cursor.at++];
    if (shift < 49) value += (byte & 127) * 2 ** shift;
    else if (byte & 127) value = Number.POSITIVE_INFINITY;
    if (!(byte & 128)) return value;
    shift += 7;
  }
  throw new Error('Invalid protobuf varint.');
}

function bytesField(bytes, field) {
  const cursor = { at: 0 };
  let found;
  while (cursor.at < bytes.length) {
    const tag = varint(bytes, cursor), wire = tag % 8, number = Math.floor(tag / 8);
    if (!Number.isSafeInteger(tag) || number < 1) throw new Error('Invalid protobuf field.');
    if (wire === 0) varint(bytes, cursor);
    else if (wire === 1) cursor.at += 8;
    else if (wire === 5) cursor.at += 4;
    else if (wire === 2) {
      const length = varint(bytes, cursor);
      if (!Number.isSafeInteger(length) || length < 0 || cursor.at + length > bytes.length) throw new Error('Invalid protobuf length.');
      if (number === field) {
        if (found) throw new Error('Duplicate protobuf field.');
        found = bytes.subarray(cursor.at, cursor.at + length);
      }
      cursor.at += length;
    } else throw new Error('Unsupported protobuf wire type.');
    if (cursor.at > bytes.length) throw new Error('Truncated protobuf.');
  }
  return found;
}

export function embeddedAudioBytes(encodedMessage) {
  const sticker = bytesField(Buffer.from(encodedMessage), 26);
  return sticker ? bytesField(sticker, 26) : undefined;
}

/** Bind by the actual generated StickerMessage instance, never by WebP hash.
 * Two identical visuals with different audio cannot overwrite one another. */
export async function withSoundSticker({ proto, message, audio }, work) {
  const sticker = message?.stickerMessage;
  const audioBytes = Buffer.from(proto.Message.AudioMessage.encode(proto.Message.AudioMessage.create(audio)).finish());
  const detach = installSoundStickerEncoder(proto).attach(sticker, audioBytes);
  try {
    const encoded = Buffer.from(proto.Message.encode(message).finish());
    if (!embeddedAudioBytes(encoded)?.equals(audioBytes)) throw new Error('Sound sticker encoding did not preserve its audio.');
    return await work();
  } finally { detach(); }
}
