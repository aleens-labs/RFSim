const net = require("net");
const tls = require("tls");

const { parsePkcs12, parseTruststore } = require("./certUtils");

function isPemLike(value = "", { kind = "generic" } = {}) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }
  if (kind === "certificate") {
    return /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/i.test(text);
  }
  if (kind === "privateKey") {
    return /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]+-----END [A-Z0-9 ]*PRIVATE KEY-----/i.test(text);
  }
  return /-----BEGIN [A-Z0-9 ]+-----[\s\S]+-----END [A-Z0-9 ]+-----/i.test(text);
}

function isTakCertUploadLike(value = "") {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }
  if (isPemLike(text)) {
    return true;
  }
  return /^data:[^;]+;base64,[a-z0-9+/=\s]+$/i.test(text);
}

function extractPemBlocks(value = "", typePattern = "[A-Z0-9 ]+") {
  const matches = String(value || "").match(
    new RegExp(`-----BEGIN ${typePattern}-----[\\s\\S]+?-----END ${typePattern}-----`, "gi")
  );
  return Array.isArray(matches) ? matches.join("\n") : "";
}

function decodeTakUploadBlob(rawValue = "") {
  const value = String(rawValue || "").trim();
  if (!value) {
    return { kind: "empty", text: "", buffer: null, mimeType: "", nameHint: "" };
  }
  if (value.startsWith("data:")) {
    const match = value.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,([\s\S]+)$/i);
    if (!match) {
      throw new Error("TAK certificate upload is malformed.");
    }
    return {
      kind: "data-url",
      text: "",
      buffer: Buffer.from(match[2].replace(/\s+/g, ""), "base64"),
      mimeType: String(match[1] || "application/octet-stream").toLowerCase(),
      nameHint: "",
    };
  }
  return {
    kind: "text",
    text: value,
    buffer: Buffer.from(value, "utf8"),
    mimeType: isPemLike(value) ? "application/x-pem-file" : "text/plain",
    nameHint: "",
  };
}

function isValidHostname(value = "") {
  const text = String(value || "").trim();
  if (!text || text.length > 253) {
    return false;
  }
  if (text.toLowerCase() === "localhost") {
    return true;
  }
  if (text.endsWith(".")) {
    return isValidHostname(text.slice(0, -1));
  }
  const labels = text.split(".");
  return labels.every((label) => (
    label.length >= 1
    && label.length <= 63
    && /^[a-z0-9-]+$/i.test(label)
    && !label.startsWith("-")
    && !label.endsWith("-")
  ));
}

function normalizeTakTlsServerName(value = "") {
  return String(value || "").trim();
}

function validateTakTlsServerName(value = "") {
  const text = normalizeTakTlsServerName(value);
  if (!text) {
    return "";
  }
  if (net.isIP(text) || isValidHostname(text)) {
    return "";
  }
  return "TLS Server Name must be a valid DNS hostname or IP address, not a label like \"RF SIM\".";
}

function getTakTlsVerifyHost(connectionOrProfile = {}) {
  const tlsServerName = String(
    connectionOrProfile.tlsServerName
    || connectionOrProfile.tls_server_name
    || ""
  ).trim();
  const host = String(
    connectionOrProfile.host
    || connectionOrProfile.serverHost
    || connectionOrProfile.server_host
    || ""
  ).trim();
  return tlsServerName || host;
}

function getTakConnectTarget(connectionOrProfile = {}) {
  const host = String(
    connectionOrProfile.host
    || connectionOrProfile.serverHost
    || connectionOrProfile.server_host
    || ""
  ).trim();
  const port = Number(
    connectionOrProfile.port
    || connectionOrProfile.serverPort
    || connectionOrProfile.server_port
    || 0
  );
  return host && Number.isFinite(port) && port > 0 ? `${host}:${port}` : host;
}

function createTakConnectionDebugDetail(connection = {}) {
  const lines = [`Connect: ${getTakConnectTarget(connection) || "unknown"}`];
  const verifyAs = getTakTlsVerifyHost(connection);
  if (String(connection.transport || "").toLowerCase() !== "tcp" && verifyAs) {
    lines.push(`Verify as: ${verifyAs}`);
  }
  return lines.join("\n");
}

function buildTakSocketConfig(profileRow, { decryptSecret = (value) => value } = {}) {
  const host = String(profileRow?.server_host || profileRow?.serverHost || "").trim();
  const port = Number(profileRow?.server_port || profileRow?.serverPort || 0);
  const transport = String(profileRow?.transport || "ssl").trim().toLowerCase();
  const tlsServerName = normalizeTakTlsServerName(profileRow?.tls_server_name || profileRow?.tlsServerName || "");
  if (!host || !Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error("TAK profile is missing a valid host or port.");
  }
  const tlsServerNameError = validateTakTlsServerName(tlsServerName);
  if (tlsServerNameError) {
    throw new Error(tlsServerNameError);
  }

  const clientCertRaw = decryptSecret(profileRow.client_cert_pem || profileRow.clientCertPem || "");
  const clientCertPassword = decryptSecret(profileRow.client_cert_password_secret || profileRow.clientCertPasswordSecret || "");
  const caCertRaw = decryptSecret(profileRow.ca_cert_pem || profileRow.caCertPem || "");
  const caCertPassword = decryptSecret(profileRow.ca_cert_password_secret || profileRow.caCertPasswordSecret || "");
  const clientCert = decodeTakUploadBlob(clientCertRaw);
  const caCert = decodeTakUploadBlob(caCertRaw);

  if (!clientCertRaw || !clientCertPassword) {
    throw new Error("TAK client certificate bundle or password is missing.");
  }

  const tlsOptions = { host, port };
  if (tlsServerName) {
    tlsOptions.servername = tlsServerName;
  }
  let verificationMode = "system";

  if (clientCert.kind === "data-url") {
    const { certPem, keyPem } = parsePkcs12(clientCert.buffer, clientCertPassword);
    tlsOptions.cert = certPem;
    tlsOptions.key = keyPem;
  } else if (
    isPemLike(clientCert.text, { kind: "certificate" })
    && isPemLike(clientCert.text, { kind: "privateKey" })
  ) {
    tlsOptions.cert = extractPemBlocks(clientCert.text, "CERTIFICATE");
    tlsOptions.key = extractPemBlocks(clientCert.text, "[A-Z0-9 ]*PRIVATE KEY");
  } else {
    throw new Error("Client certificate bundle format is not supported.");
  }

  if (!caCertRaw) {
    throw new Error("A TAK CA trust bundle is required. Server identity verification cannot be disabled.");
  } else if (caCert.kind === "text" && isPemLike(caCert.text, { kind: "certificate" })) {
    tlsOptions.ca = caCert.text;
    tlsOptions.rejectUnauthorized = true;
    verificationMode = "custom-ca";
  } else if (caCert.kind === "data-url") {
    const { caPem } = parseTruststore(caCert.buffer, caCertPassword);
    tlsOptions.ca = caPem;
    tlsOptions.rejectUnauthorized = true;
    verificationMode = "custom-ca-p12";
  } else {
    throw new Error("TAK CA trust bundle format is not supported.");
  }

  const verifyHost = getTakTlsVerifyHost({ host, tlsServerName });
  const verificationBaseNote = verificationMode === "custom-ca-p12"
    ? "The uploaded PKCS12 CA truststore is used with hostname verification enabled."
    : "The uploaded CA trust bundle is used with hostname verification enabled.";
  const verificationNote = `${verificationBaseNote} TLS verifies as ${verifyHost}.`;

  return {
    host,
    port,
    transport,
    tlsServerName,
    verifyHost,
    connectTarget: getTakConnectTarget({ host, port }),
    tlsOptions,
    verificationMode,
    verificationNote,
  };
}

function connectTakSocket(connection) {
  const { transport, tlsOptions, host, port } = connection;
  if (transport === "tcp" || transport === "plain") {
    return net.connect({ host, port });
  }
  return tls.connect(tlsOptions);
}

function attemptTakConnection(connection, { timeoutMs = 6000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let socket;
    let timerId = null;
    try {
      socket = connectTakSocket(connection);
    } catch (error) {
      reject(error);
      return;
    }

    const cleanup = () => {
      clearTimeout(timerId);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
      socket.removeListener("connect", onConnect);
      socket.removeListener("secureConnect", onSecureConnect);
    };

    const finish = (fn) => (value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      try {
        socket.end?.();
      } catch {}
      socket.destroy();
      fn(value);
    };

    const onError = finish(reject);
    const onClose = finish(() => reject(new Error("Socket closed before the TAK connection completed.")));
    const onConnect = finish(() => resolve({ transport: connection.transport, authorized: true }));
    const onSecureConnect = finish(() => resolve({
      transport: connection.transport,
      authorized: socket.authorized !== false,
      authorizationError: socket.authorizationError || "",
      peerCertificate: socket.getPeerCertificate?.() || null,
    }));
    timerId = setTimeout(() => {
      onError(new Error(`Connection timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    socket.once("error", onError);
    socket.once("close", onClose);
    if (socket instanceof tls.TLSSocket) {
      socket.once("secureConnect", onSecureConnect);
    } else {
      socket.once("connect", onConnect);
    }
  });
}

function summarizeTakConnectionFailure(error, connection = {}) {
  const rawMessage = String(error?.message || error || "TAK connection failed.");
  const connectTarget = getTakConnectTarget(connection) || "unknown";
  const verifyAs = getTakTlsVerifyHost(connection);
  const isTls = String(connection.transport || "").toLowerCase() !== "tcp";

  let reason = "connection-failed";
  let hint = "";
  let message = rawMessage;

  if (/Hostname\/IP does not match certificate'?s altnames/i.test(rawMessage)) {
    reason = "hostname-mismatch";
    message = `TAK TLS hostname mismatch while connecting to ${connectTarget}. TLS verified as ${verifyAs}.`;
    hint = net.isIP(String(connection.host || "")) && !String(connection.tlsServerName || "").trim()
      ? "Set TLS Server Name to the DNS name printed on the TAK server certificate, or use that DNS name as the server address."
      : `The TAK server certificate does not include ${verifyAs} in its subject alternative names.`;
  } else if (/timed out/i.test(rawMessage)) {
    reason = "timeout";
    message = `TAK connection timed out while connecting to ${connectTarget}.`;
    hint = "Confirm the TAK server is reachable on the selected port and that any firewall allows the connection.";
  } else if (/ECONNREFUSED/i.test(rawMessage)) {
    reason = "refused";
    message = `TAK connection was refused by ${connectTarget}.`;
    hint = "Confirm the TAK server address, port, and protocol are correct.";
  } else if (/unable to verify the first certificate|self[- ]signed certificate|unable to get local issuer certificate/i.test(rawMessage)) {
    reason = "untrusted-cert";
    message = `TAK TLS trust validation failed while connecting to ${connectTarget}.`;
    hint = "Confirm the uploaded CA trust bundle matches the TAK server certificate chain.";
  } else if (isTls) {
    message = `TAK TLS connection failed while connecting to ${connectTarget}. ${rawMessage}`;
  } else {
    message = `TAK connection failed while connecting to ${connectTarget}. ${rawMessage}`;
  }

  return {
    reason,
    rawMessage,
    message,
    hint,
    connectTarget,
    verifyAs,
  };
}

module.exports = {
  attemptTakConnection,
  buildTakSocketConfig,
  connectTakSocket,
  createTakConnectionDebugDetail,
  getTakConnectTarget,
  getTakTlsVerifyHost,
  isPemLike,
  isTakCertUploadLike,
  normalizeTakTlsServerName,
  summarizeTakConnectionFailure,
  validateTakTlsServerName,
};
