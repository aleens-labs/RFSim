const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("net");

const {
  attemptTakConnection,
  buildTakSocketConfig,
  summarizeTakConnectionFailure,
  validateTakConnectHost,
  validateTakTlsServerName,
} = require("../src/tak/connection");

const CLIENT_CERT_PEM = [
  "-----BEGIN CERTIFICATE-----",
  "MIIBszCCAVmgAwIBAgIUQ2xpZW50Q2VydEV4YW1wbGUwCgYIKoZIzj0EAwIwEzER",
  "MA8GA1UEAwwIQ2xpZW50Q0EwHhcNMjYwNTA2MDAwMDAwWhcNMzYwNTA0MDAwMDAw",
  "WjATMREwDwYDVQQDDAhDbGllbnQxMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE",
  "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8k5s4WvyaManIeZDV4SSQd",
  "n0pV3hokW2N1Z0pQeG9YQXZw86NTMFEwHQYDVR0OBBYEFGZmZmZmZmZmZmZmZmZm",
  "ZmZmZmZmMB8GA1UdIwQYMBaAFGZmZmZmZmZmZmZmZmZmZmZmZmZmMA8GA1UdEwEB",
  "/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIgTQkq7FpC18JNpDutLCRa14Q6gttY",
  "fVSxGInxjeRGnaECIQDZHuLlHotE5T7V6czS4QhIwTZYBFvTo95OfzmiEJeZ1A==",
  "-----END CERTIFICATE-----",
  "-----BEGIN PRIVATE KEY-----",
  "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgAQIDBAUGBwgJCgsM",
  "DQ4PEBESExQVFhcYGRobHB0eHyChRANCAAQAAQIDBAUGBwgJCgsMDQ4PEBESExQV",
  "FhcYGRobHB0eHyTmzha/Joxqch5kNXhJJB2fSlXeGiRbY3VnSlB4b1hBdnDz",
  "-----END PRIVATE KEY-----",
].join("\n");

const CA_CERT_PEM = [
  "-----BEGIN CERTIFICATE-----",
  "MIIBYzCCAQmgAwIBAgIURXhhbXBsZUNBMB4XDTI2MDUwNjAwMDAwMFoXDTM2MDUw",
  "NDAwMDAwMFowEzERMA8GA1UEAwwIQ2xpZW50Q0EwWTATBgcqhkjOPQIBBggqhkjO",
  "PQMBBwNCAARERERERERERERERERERERERERERERERERERERERERERERERERERERE",
  "RERERERERERERERERERERERERERERERTo1MwUTAdBgNVHQ4EFgQUVVVVVVVVVVVV",
  "VVVVVVVVVVVVVVUwHwYDVR0jBBgwFoAUVVVVVVVVVVVVVVVVVVVVVVVVVVUwDwYD",
  "VR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiEA0l9wH14r2raXIiQunlsl",
  "5T2r8j04YfGLwRoTSesFiNUCIGXL9uBeb5GsyhQOdE31x4n4t4DccnE9vrFica8F",
  "gxYk",
  "-----END CERTIFICATE-----",
].join("\n");

function createProfile(overrides = {}) {
  return {
    server_host: "3.150.66.52",
    tls_server_name: "",
    server_port: 8089,
    transport: "ssl",
    client_cert_pem: CLIENT_CERT_PEM,
    client_cert_password_secret: "secret",
    ca_cert_pem: CA_CERT_PEM,
    ca_cert_password_secret: "secret",
    ...overrides,
  };
}

test("buildTakSocketConfig preserves IP connect target and uses TLS server name override", () => {
  const config = buildTakSocketConfig(createProfile({
    tls_server_name: "tak.example.mil",
  }));

  assert.equal(config.host, "3.150.66.52");
  assert.equal(config.connectTarget, "3.150.66.52:8089");
  assert.equal(config.verifyHost, "tak.example.mil");
  assert.equal(config.tlsOptions.servername, "tak.example.mil");
  assert.match(config.verificationNote, /TLS verifies as tak\.example\.mil/);
});

test("buildTakSocketConfig falls back to the server host when no TLS server name is set", () => {
  const config = buildTakSocketConfig(createProfile());

  assert.equal(config.verifyHost, "3.150.66.52");
  assert.equal(config.tlsOptions.servername, undefined);
});

test("validateTakTlsServerName rejects display labels with spaces", () => {
  assert.match(
    validateTakTlsServerName("RF SIM"),
    /valid DNS hostname or IP address/i
  );
});

test("validateTakConnectHost blocks unsafe host targets by default", () => {
  assert.match(validateTakConnectHost("localhost"), /cannot be localhost/i);
  assert.match(validateTakConnectHost("127.0.0.1"), /cannot be/i);
  assert.match(validateTakConnectHost("10.0.0.5"), /cannot be/i);
  assert.match(validateTakConnectHost("169.254.169.254"), /cannot be/i);
  assert.match(validateTakConnectHost("::1"), /cannot be/i);
  assert.equal(validateTakConnectHost("tak.example.mil"), "");
  assert.equal(validateTakConnectHost("3.150.66.52"), "");
});

test("validateTakConnectHost allows unsafe targets only when explicitly enabled", () => {
  assert.equal(validateTakConnectHost("127.0.0.1", { allowUnsafeHost: true }), "");
  assert.equal(validateTakConnectHost("localhost", { allowUnsafeHost: true }), "");
});

test("buildTakSocketConfig enforces TAK host safety unless explicitly disabled", () => {
  assert.throws(
    () => buildTakSocketConfig(createProfile({ server_host: "127.0.0.1" })),
    /cannot be/i
  );

  const config = buildTakSocketConfig(
    createProfile({ server_host: "127.0.0.1" }),
    { allowUnsafeHost: true }
  );
  assert.equal(config.host, "127.0.0.1");
});

test("summarizeTakConnectionFailure explains IP hostname mismatch with an actionable hint", () => {
  const failure = summarizeTakConnectionFailure(
    new Error("Hostname/IP does not match certificate's altnames: IP: 3.150.66.52 is not in the cert's list: "),
    {
      host: "3.150.66.52",
      port: 8089,
      transport: "ssl",
      tlsServerName: "",
    }
  );

  assert.equal(failure.reason, "hostname-mismatch");
  assert.match(failure.message, /TLS hostname mismatch/);
  assert.match(failure.hint, /Set TLS Server Name/);
  assert.equal(failure.verifyAs, "3.150.66.52");
});

test("attemptTakConnection succeeds against a reachable TCP listener", async () => {
  const server = net.createServer((socket) => {
    socket.end();
  });

  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  try {
    const address = server.address();
    const result = await attemptTakConnection({
      host: "127.0.0.1",
      port: address.port,
      transport: "tcp",
      tlsOptions: {},
    }, { timeoutMs: 2000 });

    assert.equal(result.transport, "tcp");
    assert.equal(result.authorized, true);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});
