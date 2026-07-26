import { createHash, createHmac } from 'node:crypto';

const HOST = 'visual.volcengineapi.com';

export interface VolcengineCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  service?: string;
}

export interface FacePrettyOptions {
  /** When true, beautify all faces; otherwise only the largest face. */
  multiFace?: boolean;
  /** Beauty level in the range [0.0, 1.0]. Higher means stronger beautification. */
  beautyLevel?: number;
  /** Whether to run content moderation on the input image. */
  doRisk?: boolean;
}

interface FacePrettyResult {
  code: number;
  message?: string;
  data?: { image?: string };
}

const pad = (value: number): string => value.toString().padStart(2, '0');

/** Formats a UTC date as `YYYYMMDD'T'HHMMSS'Z'` (e.g. `20201103T104027Z`). */
function formatXDate(date: Date): string {
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

const sha256Hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

const hmacSha256 = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();

function getSigningKey(secret: string, shortDate: string, region: string, service: string): Buffer {
  const kDate = hmacSha256(secret, shortDate);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'request');
}

/** Percent-encode a string using RFC 3986 rules (for canonical query strings). */
function encode(value: string): string {
  return encodeURIComponent(value)
    .replaceAll('!', '%21')
    .replaceAll('*', '%2A')
    .replaceAll("'", '%27')
    .replaceAll('(', '%28')
    .replaceAll(')', '%29');
}

/**
 * Calls the Volcengine FacePretty API and returns the processed image as a Buffer.
 * Implements the Volcengine signature v4 (HMAC-SHA256) signing scheme server-side,
 * so the access key / secret never leave the backend container.
 */
export async function facePretty(
  imageBase64: string,
  credentials: VolcengineCredentials,
  options: FacePrettyOptions = {},
): Promise<Buffer> {
  const region = credentials.region ?? 'cn-north-1';
  const service = credentials.service ?? 'cv';
  const xDate = formatXDate(new Date());
  const shortDate = xDate.slice(0, 8);

  const query: Record<string, string> = {
    Action: 'FacePretty',
    Version: '2020-08-26',
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((key) => `${encode(key)}=${encode(query[key]!)}`)
    .join('&');

  const bodyParams: Record<string, string> = { image_base64: imageBase64 };
  if (options.multiFace) {
    bodyParams.multi_face = '1';
  }
  if (options.beautyLevel !== undefined) {
    bodyParams.beauty_level = String(options.beautyLevel);
  }
  if (options.doRisk !== undefined) {
    bodyParams.do_risk = String(options.doRisk);
  }
  const body = new URLSearchParams(bodyParams).toString();

  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    host: HOST,
    'x-date': xDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]!.trim()}\n`)
    .join('');

  const payloadHash = sha256Hex(body);
  const canonicalRequest = ['POST', '/', canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = ['HMAC-SHA256', xDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const signingKey = getSigningKey(credentials.secretAccessKey, shortDate, region, service);
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorization = `HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${HOST}/?${canonicalQuery}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Host: HOST,
      'X-Date': xDate,
      Authorization: authorization,
    },
    body,
    signal: AbortSignal.timeout(60_000),
  });

  const text = await response.text();
  let json: FacePrettyResult;
  try {
    json = JSON.parse(text) as FacePrettyResult;
  } catch {
    throw new Error(`FacePretty API returned a non-JSON response (status ${response.status}): ${text}`);
  }

  if (!response.ok || json.code !== 10_000) {
    const detail = json.message ?? text;
    throw new Error(`FacePretty API failed (code ${json.code ?? response.status}): ${detail}`);
  }

  const image = json.data?.image;
  if (!image) {
    throw new Error('FacePretty API succeeded but returned no image data');
  }
  return Buffer.from(image, 'base64');
}
