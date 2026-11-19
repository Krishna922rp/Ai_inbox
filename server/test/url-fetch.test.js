import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchPage,
  isPublicAddress,
  resolvePublicAddress
} from '../src/url-fetch.js';

test('allows globally routable IPv4 and IPv6 addresses', () => {
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('1.1.1.1'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('rejects private, local, shared, documentation and reserved addresses', () => {
  const blocked = [
    '0.1.2.3',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.20.0.1',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.4',
    '203.0.113.10',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fd12::1',
    'fe80::1',
    '2001:db8::1',
    '2002::1',
    'ff02::1'
  ];

  for (const address of blocked) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

test('fails closed when any DNS answer is not public', async () => {
  const resolver = async () => [
    { address: '8.8.8.8', family: 4 },
    { address: '10.0.0.8', family: 4 }
  ];

  await assert.rejects(
    resolvePublicAddress('mixed.example', resolver),
    (error) => error.status === 400
  );
});

test('rejects localhost before making a request', async () => {
  await assert.rejects(
    resolvePublicAddress('service.localhost', async () => []),
    (error) => error.status === 400
  );
});

test('validates URL scheme, credentials and non-standard ports', async () => {
  await assert.rejects(fetchPage('file:///etc/passwd'), (error) => error.status === 400);
  await assert.rejects(fetchPage('https://user:pass@example.com'), (error) => error.status === 400);
  await assert.rejects(fetchPage('https://example.com:8443/path'), (error) => error.status === 400);
});

test('pins the validated DNS address and extracts readable page text', async () => {
  let requestedAddress;

  const result = await fetchPage('https://example.com/article#section', {
    resolver: async () => [{ address: '93.184.216.34', family: 4 }],
    requestImpl: async (url, address) => {
      requestedAddress = address;
      assert.equal(url.hostname, 'example.com');
      assert.equal(url.hash, '');
      return {
        statusCode: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<html><head><title>Example article</title></head><body><nav>Menu</nav><main><p>Useful saved text.</p><script>ignore()</script></main></body></html>'
      };
    }
  });

  assert.deepEqual(requestedAddress, { address: '93.184.216.34', family: 4 });
  assert.equal(result.title, 'Example article');
  assert.equal(result.content, 'Useful saved text.');
  assert.equal(result.url, 'https://example.com/article');
});

test('rejects redirects rather than following an unchecked destination', async () => {
  await assert.rejects(
    fetchPage('https://example.com/start', {
      resolver: async () => [{ address: '93.184.216.34', family: 4 }],
      requestImpl: async () => ({ statusCode: 302, headers: { location: 'http://127.0.0.1' }, body: '' })
    }),
    (error) => error.status === 422
  );
});

test('rejects an oversized response body even when no content length is supplied', async () => {
  await assert.rejects(
    fetchPage('https://example.com/large', {
      resolver: async () => [{ address: '93.184.216.34', family: 4 }],
      maxBytes: 8,
      requestImpl: async () => ({
        statusCode: 200,
        contentType: 'text/plain',
        body: 'This response is too large.'
      })
    }),
    (error) => error.status === 413
  );
});

test('rejects non-text content types', async () => {
  await assert.rejects(
    fetchPage('https://example.com/image', {
      resolver: async () => [{ address: '93.184.216.34', family: 4 }],
      requestImpl: async () => ({
        statusCode: 200,
        contentType: 'image/png',
        body: 'not readable text'
      })
    }),
    (error) => error.status === 422
  );
});
