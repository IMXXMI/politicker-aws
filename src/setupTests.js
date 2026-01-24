// Polyfills for Firebase/Jest (TextEncoder and ReadableStream for auth/fetch)
import 'text-encoding';  // Fixes TextEncoder
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// ReadableStream polyfill for undici/fetch
if (typeof global.ReadableStream === 'undefined') {
  global.ReadableStream = require('stream/web').ReadableStream;
}