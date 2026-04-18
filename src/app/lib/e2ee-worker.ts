/**
 * E2EE Frame Worker — AES-GCM-256 Frame-Verschluesselung fuer Mesh-Modus
 *
 * Wird von RTCRtpScriptTransform aufgerufen.
 * Verschluesselt ausgehende und entschluesselt eingehende Media-Frames.
 *
 * Frame-Format (verschluesselt):
 *   [12 Byte IV][AES-GCM Ciphertext + 16 Byte Auth-Tag]
 */

const IV_LENGTH = 12;

let encryptKey: CryptoKey | null = null;
let decryptKey: CryptoKey | null = null;
let frameCounter = 0;

function generateIV(): Uint8Array {
  const iv = new Uint8Array(IV_LENGTH);
  // Deterministische IV-Basis aus Counter + Zufallskomponente
  const view = new DataView(iv.buffer);
  view.setUint32(0, frameCounter++);
  // Restliche 8 Bytes zufaellig
  crypto.getRandomValues(iv.subarray(4));
  return iv;
}

async function encryptFrame(
  frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
  controller: TransformStreamDefaultController,
) {
  if (!encryptKey) {
    controller.enqueue(frame);
    return;
  }

  try {
    const iv = generateIV();
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      encryptKey,
      frame.data,
    );

    const result = new ArrayBuffer(IV_LENGTH + encrypted.byteLength);
    const view = new Uint8Array(result);
    view.set(iv, 0);
    view.set(new Uint8Array(encrypted), IV_LENGTH);

    frame.data = result;
    controller.enqueue(frame);
  } catch (e) {
    // Bei Fehler: Frame unverschluesselt weiterleiten statt droppen
    console.error('[E2EE Worker] Encrypt error:', e);
    controller.enqueue(frame);
  }
}

async function decryptFrame(
  frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
  controller: TransformStreamDefaultController,
) {
  if (!decryptKey) {
    controller.enqueue(frame);
    return;
  }

  const data = new Uint8Array(frame.data);
  if (data.byteLength < IV_LENGTH + 16) {
    // Zu kurz fuer IV + Auth-Tag — unverschluesselter Frame
    controller.enqueue(frame);
    return;
  }

  try {
    const iv = data.slice(0, IV_LENGTH);
    const ciphertext = data.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      decryptKey,
      ciphertext,
    );

    frame.data = decrypted;
    controller.enqueue(frame);
  } catch (e) {
    // AES-GCM Auth-Fehler — Frame droppen (manipuliert oder falsche Key)
    // Nicht weiterleiten, da Inhalt nicht verifiziert werden konnte
  }
}

// RTCRtpScriptTransform Event-Handler
// @ts-expect-error — Worker-Globals fuer RTCRtpScriptTransform
self.onrtctransform = (event: { transformer: { readable: ReadableStream; writable: WritableStream; options: { operation: string } } }) => {
  const { readable, writable, options } = event.transformer;
  const operation = options.operation;

  const transform =
    operation === 'encrypt'
      ? new TransformStream({ transform: encryptFrame })
      : new TransformStream({ transform: decryptFrame });

  readable.pipeThrough(transform).pipeTo(writable);
};

// Key-Import via postMessage
self.addEventListener('message', async (event: MessageEvent) => {
  const { type, keyData } = event.data;
  if (type === 'setKey' && keyData) {
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    encryptKey = key;
    decryptKey = key;
    frameCounter = 0;
  }
});
