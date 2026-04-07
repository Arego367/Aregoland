/**
 * Arego Chat — S3 Storage Service
 *
 * Hetzner Object Storage (S3-kompatibel).
 * Bietet Upload, Presigned-URL und Delete.
 * Datenschutz: Dateien gehoeren dem Nutzer, Server speichert keine Metadaten.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'eu-central',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.S3_BUCKET || 'aregoland';

/**
 * Datei hochladen.
 * @param {string} key   — Pfad/Name im Bucket (z.B. "avatars/abc123.jpg")
 * @param {Buffer} buffer — Dateiinhalt
 * @param {string} contentType — MIME-Type (z.B. "image/jpeg")
 */
export async function uploadFile(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
}

/**
 * Presigned URL erzeugen (1 Stunde gueltig).
 * @param {string} key — Pfad/Name im Bucket
 * @returns {Promise<string>} — Signierte URL
 */
export async function getFileUrl(key) {
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }), { expiresIn: 3600 });
}

/**
 * Datei loeschen.
 * @param {string} key — Pfad/Name im Bucket
 */
export async function deleteFile(key) {
  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));
}

/**
 * Verbindung testen — wird beim Server-Start aufgerufen.
 * Gibt true zurueck wenn der Bucket erreichbar ist.
 */
export async function testConnection() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`[Storage] Verbunden mit Bucket "${BUCKET}" via ${process.env.S3_ENDPOINT}`);
    return true;
  } catch (err) {
    console.error(`[Storage] Verbindung fehlgeschlagen: ${err.message}`);
    return false;
  }
}
