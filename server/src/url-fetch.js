import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { load } from 'cheerio';

const MAX_PAGE_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 12_000;

function ipv4ToBigInt(address) {
  return address.split('.').reduce(
    (value, part) => (value << 8n) + BigInt(Number(part)),
    0n
  );
}

function ipv6ToBigInt(address) {
  let source = address.toLowerCase().split('%')[0];

  // Convert an embedded IPv4 tail into its two hexadecimal groups.
  if (source.includes('.')) {
    const separator = source.lastIndexOf(':');
    const ipv4 = ipv4ToBigInt(source.slice(separator + 1));
    source = source.slice(0, separator + 1) +
      (ipv4 >> 16n).toString(16) + ':' + (ipv4 & 0xffffn).toString(16);
  }

  const halves = source.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  const groups = halves.length > 1
    ? [...left, ...Array(Math.max(0, missing)).fill('0'), ...right]
    : left;

  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) {
    throw new Error('Invalid IPv6 address');
  }

  return groups.reduce(
    (value, part) => (value << 16n) + BigInt(parseInt(part, 16)),
    0n
  );
}

function inIpv4Range(address, network, prefix) {
  const shift = 32n - BigInt(prefix);
  return (ipv4ToBigInt(address) >> shift) === (ipv4ToBigInt(network) >> shift);
}

function inIpv6Range(value, network, prefix) {
  const shift = 128n - BigInt(prefix);
  return (value >> shift) === (ipv6ToBigInt(network) >> shift);
}

const BLOCKED_IPV4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
];

const BLOCKED_IPV6 = [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20]
];

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function isPublicAddress(address) {
  const family = net.isIP(address);

  if (family === 4) {
    return !BLOCKED_IPV4.some(([network, prefix]) =>
      inIpv4Range(address, network, prefix)
    );
  }

  if (family === 6) {
    try {
      const value = ipv6ToBigInt(address);
      // Public IPv6 global-unicast allocations are in 2000::/3.
      const globalUnicast = (value >> 125n) === 1n;
      return globalUnicast && !BLOCKED_IPV6.some(([network, prefix]) =>
        inIpv6Range(value, network, prefix)
      );
    } catch {
      return false;
    }
  }

  return false;
}

export async function resolvePublicAddress(hostname, resolver = dnsLookup) {
  const host = hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();

  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw httpError('This URL host is not publicly reachable.');
  }

  let records;
  try {
    records = net.isIP(host)
      ? [{ address: host, family: net.isIP(host) }]
      : await resolver(host, { all: true, verbatim: true });
  } catch {
    records = [];
  }

  if (!records.length || records.some(({ address }) => !isPublicAddress(address))) {
    throw httpError('This URL host is not publicly reachable.');
  }

  // The selected address is pinned into the outbound request below. The
  // original hostname is retained for the HTTP Host header and TLS SNI.
  return records[0];
}

function requestText(url, resolved, { timeoutMs, maxBytes }) {
  return new Promise((resolve, reject) => {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const transport = url.protocol === 'https:' ? https : http;
    let settled = false;
    let totalTimer;

    const fail = (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(totalTimer);
        reject(error);
      }
    };

    const request = transport.request({
      hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        host: url.host,
        'user-agent': 'RecallInbox/1.0',
        accept: 'text/html, text/plain;q=0.9'
      },
      lookup: (_requestedHost, options, callback) => {
        if (options?.all) {
          callback(null, [resolved]);
        } else {
          callback(null, resolved.address, resolved.family);
        }
      },
      servername: url.protocol === 'https:' && net.isIP(hostname) === 0
        ? hostname
        : undefined,
      maxHeaderSize: 16 * 1024
    }, (response) => {
      const statusCode = response.statusCode || 0;

      if (statusCode >= 300 && statusCode < 400) {
        response.resume();
        fail(httpError('Redirects are not allowed when saving a web page.', 422));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        fail(httpError('The page could not be fetched (HTTP ' + statusCode + ').', 422));
        return;
      }

      const contentType = String(response.headers['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase();

      if (!['text/html', 'text/plain'].includes(contentType)) {
        response.resume();
        fail(httpError('URL must return readable HTML or text.', 422));
        return;
      }

      const contentLength = Number(response.headers['content-length'] || 0);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        response.resume();
        fail(httpError('Page exceeds the 2 MB limit.', 413));
        return;
      }

      const chunks = [];
      let totalBytes = 0;

      response.on('data', (chunk) => {
        if (settled) return;
        totalBytes += chunk.length;

        if (totalBytes > maxBytes) {
          fail(httpError('Page exceeds the 2 MB limit.', 413));
          response.destroy();
          request.destroy();
          return;
        }

        chunks.push(chunk);
      });

      response.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(totalTimer);
        resolve({
          statusCode,
          contentType,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });

      response.on('error', (error) => {
        fail(error);
      });
    });

    totalTimer = setTimeout(() => {
      request.destroy(httpError('The page request timed out.', 504));
    }, timeoutMs);
    totalTimer.unref?.();

    request.on('error', (error) => {
      fail(error.status ? error : httpError('Unable to fetch the requested public page.', 422));
    });

    request.end();
  });
}

export async function fetchPage(rawUrl, options = {}) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim() || rawUrl.length > 2048) {
    throw httpError('Enter a valid URL of 2,048 characters or fewer.');
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw httpError('Enter a valid URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw httpError('Only public HTTP(S) URLs are supported.');
  }

  // Restrict outbound requests to the standard web ports. This avoids using
  // the ingestion endpoint as a general-purpose port scanner.
  if (url.port) {
    throw httpError('Only standard HTTP and HTTPS ports are supported.');
  }

  url.hash = '';
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const resolver = options.resolver || dnsLookup;
  const resolved = await resolvePublicAddress(hostname, resolver);
  const maxBytes = options.maxBytes || MAX_PAGE_BYTES;
  const response = await (options.requestImpl || requestText)(url, resolved, {
    timeoutMs: options.timeoutMs || REQUEST_TIMEOUT_MS,
    maxBytes
  });

  if (response.statusCode >= 300 && response.statusCode < 400) {
    throw httpError('Redirects are not allowed when saving a web page.', 422);
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw httpError('The requested page could not be fetched.', 422);
  }

  const contentType = String(
    response.contentType || response.headers?.['content-type'] || ''
  ).split(';')[0].trim().toLowerCase();

  if (!['text/html', 'text/plain'].includes(contentType)) {
    throw httpError('URL must return readable HTML or text.', 422);
  }

  const body = Buffer.isBuffer(response.body)
    ? response.body.toString('utf8')
    : String(response.body || '');

  if (Buffer.byteLength(body, 'utf8') > maxBytes) {
    throw httpError('Page exceeds the 2 MB limit.', 413);
  }

  if (contentType === 'text/plain') {
    return { title: hostname, content: body.trim(), url: url.href };
  }

  const $ = load(body);
  const title = $('title').first().text().trim() || hostname;
  $('script, style, noscript, svg, nav, footer, header, form').remove();

  const mainText = $('main').text();
  const articleText = $('article').text();
  const content = (mainText || articleText || $('body').text())
    .replace(/\s+/g, ' ')
    .trim();

  return { title, content, url: url.href };
}
