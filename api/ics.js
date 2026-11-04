"use strict";

/*
 * GET /api/ics?url=<https or webcal calendar feed>
 *
 * Browsers cannot read most calendar feeds directly (no CORS headers), so this
 * Vercel function fetches the feed for the import dialog. It is deliberately
 * narrow: GET only, https on port 443 only, public IP addresses only (checked
 * again at connect time, so DNS tricks cannot reach internal hosts), redirects
 * re-validated, 2 MB cap, 8 s timeout, and the body must look like an iCalendar
 * file. Nothing is stored or logged.
 */

const dns = require("dns");
const https = require("https");
const net = require("net");

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

const blocked = new net.BlockList();
[
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
].forEach(([addr, prefix]) => blocked.addSubnet(addr, prefix, "ipv4"));
[
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64],
  ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]
].forEach(([addr, prefix]) => blocked.addSubnet(addr, prefix, "ipv6"));

function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

function isPrivateAddress(ip) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) ip = mapped[1];
  // Hex-form IPv4-mapped addresses (::ffff:7f00:1). A ::ffff:0:0/96 BlockList rule would also match
  // every plain IPv4 address, so refuse this form explicitly instead.
  if (/^::ffff:/i.test(ip)) return true;
  const family = net.isIP(ip);
  if (!family) return true; // not an address we can reason about: refuse
  return blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

// Used as the socket's DNS lookup, so the address that is checked is the address that is connected to.
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
      return callback(httpError(400, "That address is not allowed.", "EBLOCKED"));
    }
    if (options && options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

function parseTarget(raw) {
  let u;
  try { u = new URL(String(raw || "").trim().replace(/^webcal:/i, "https:")); }
  catch (e) { throw httpError(400, "That does not look like a valid calendar address."); }
  if (u.protocol !== "https:") throw httpError(400, "Calendar feed addresses must use https:// or webcal://.");
  if (u.username || u.password) throw httpError(400, "Remove the username and password from the address.");
  if (u.port && u.port !== "443") throw httpError(400, "Only the standard https port is supported.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isPrivateAddress(host)) throw httpError(400, "That address is not allowed.", "EBLOCKED");
  return u;
}

function requestOnce(u) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: "https:",
      hostname: u.hostname.replace(/^\[|\]$/g, ""),
      port: 443,
      path: u.pathname + u.search,
      method: "GET",
      lookup: safeLookup,
      timeout: TIMEOUT_MS,
      headers: { "User-Agent": "Driftboard-ICS/1.0", Accept: "text/calendar, text/plain;q=0.8, */*;q=0.5" }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return resolve({ redirect: res.headers.location });
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(httpError(502, "The calendar server answered with status " + res.statusCode + "."));
      }
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) { req.destroy(httpError(413, "That calendar feed is too large (over 2 MB).")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(httpError(504, "The calendar server took too long to respond.")));
    req.on("error", reject);
    req.end();
  });
}

async function fetchFeed(raw) {
  let u = parseTarget(raw);
  for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
    const result = await requestOnce(u);
    if (result.body !== undefined) return result.body;
    u = parseTarget(new URL(result.redirect, u).toString());
  }
  throw httpError(502, "The calendar address redirected too many times.");
}

function send(res, status, type, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(body);
}
function sendError(res, err) {
  let status = err.status || 502, message = err.message;
  if (!err.status) {
    if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") message = "Could not find that calendar server.";
    else message = "Could not fetch that calendar feed.";
  }
  send(res, status, "application/json; charset=utf-8", JSON.stringify({ error: message }));
}

async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendError(res, httpError(405, "Use GET."));
  }
  try {
    const target = new URL(req.url, "http://localhost").searchParams.get("url");
    const body = await fetchFeed(target);
    if (!/BEGIN:VCALENDAR/i.test(body)) throw httpError(422, "That address did not return a calendar (.ics) feed.");
    send(res, 200, "text/calendar; charset=utf-8", body);
  } catch (err) {
    sendError(res, err);
  }
}

module.exports = handler;
module.exports._test = { isPrivateAddress, parseTarget };
