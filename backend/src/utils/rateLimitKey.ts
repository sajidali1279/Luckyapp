// The rate limits are per person, so they need the person's address.
//
// The API sits behind Cloudflare and then Render's own proxy. With one trusted hop Express reports a Cloudflare
// address, and Cloudflare serves each request from one of a small pool of addresses: twelve requests from one
// connection landed in two different limit buckets, and every customer in the region shares those buckets. So a
// handful of signups or sign-ins from anywhere in Texas could use up the limit for everyone.
// Cloudflare puts the real client address in CF-Connecting-IP and replaces any value a client sends itself, so that
// header is used when it is present and is a valid address; otherwise the address Express reports.

import { Request } from 'express';
import net from 'net';

export function clientKey(req: Request): string {
  const raw = req.headers['cf-connecting-ip'];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (value && net.isIP(value)) return value;
  return req.ip ?? 'unknown';
}
