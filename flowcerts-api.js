const process = require("process");
require('dotenv').config()

const EC = require("elliptic").ec;
const SHA3 = require("sha3").SHA3;
const ec = new EC("p256");

const fcl = require("@onflow/fcl");

fcl.config({
  "accessNode.api": "https://testnet.onflow.org",
  "discovery.wallet": "https://fcl-discovery.onflow.org/testnet/authn",
  "app.detail.title": "FlowCerts",
  "app.detail.icon": "https://em-content.zobj.net/source/microsoft-teams/363/sunset_1f307.png",
  "0xFileNFTContract3": "0x8af0983838671200",
  "0xFilePrivilegesContract": "0x8af0983838671200",
  "flow.network": "testnet",
});

const fastify = require('fastify');
const multipart = require('@fastify/multipart');
const RD = require('reallydangerous');
const signer = new RD.Signer(process.env.SESSION_SECRET);

const accountAPI = require("./api_modules/account");
const filesAPI = require("./api_modules/files");

const { MongoClient, ServerApiVersion } = require('mongodb');
const { strict } = require("assert");
const uri = process.env.MONGODB_URI;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const dbConnection = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  let app = fastify();
  await dbConnection.connect();

  // CORS - offload to Nginx in production
  function setCORSHeaders(req, res) {
    if (req.headers["origin"] === process.env.REQUIRED_ORIGIN) { // for production, set the correct origin
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
      res.header("Access-Control-Allow-Headers", "*");
      res.header("Access-Control-Max-Age", 86400);
    }
  }

  app.options("/*", (req, res) => {
    setCORSHeaders(req, res);
    res.send();
  });

  // Authorization Function
  const hashMsg = (msg) => {
    const sha = new SHA3(256);
    sha.update(Buffer.from(msg, "hex"));
    return sha.digest();
  };

  const produceSignature = (privateKey, msg) => {
    const key = ec.keyFromPrivate(Buffer.from(privateKey, "hex"));
    const sig = key.sign(hashMsg(msg));
    const n = 32;
    const r = sig.r.toArrayLike(Buffer, "be", n);
    const s = sig.s.toArrayLike(Buffer, "be", n);
    return Buffer.concat([r, s]).toString("hex");
  };

  const createSigningFunction = (privateKey, address) => async (signable) => {
    return {
      addr: fcl.withPrefix(address),
      keyId: 0,
      signature: produceSignature(privateKey, signable.message),
    };
  };

  // API routes
  let apiOptions = {
    fclAdminAuthorizationFunction: (txAccount) => {
      return {
        ...txAccount,
        addr: fcl.withPrefix(process.env.FLOW_ADDRESS),
        keyId: 0,
        signingFunction: createSigningFunction(process.env.FLOW_PRIVATE_KEY, process.env.FLOW_ADDRESS),
      };
    },
    dbConnection,
    authorizationValidation: {
      type: "object",
      required: ["Authorization"],
      properties: { Authorization: { type: "string" } },
    },
    checkAuthToken: (token, checkSetup) => {
      try {
        let data = JSON.parse(signer.unsign(token));
        if (checkSetup && !data.setup) return false;
        if (data.exp < (new Date()).getTime()) return false;
        return data;
      }
      catch (e) { return false; }
    },
    issueAuthToken: (addr, setup, domain = null) => {
      return signer.sign(JSON.stringify({
        setup,
        exp: (new Date()).getTime() + (14 * 24 * 3600 * 1000), // 2 weeks
        addr,
        domain,
      }));
    },
    fcl,
    unauthenticated: (res) => {
      res.statusCode = 401;
      res.send();
    },
  };

  app.register(multipart);
  app.register(accountAPI, apiOptions);
  app.register(filesAPI, apiOptions);

  // strip all request validation errors
  app.addHook('onSend', (req, res, payload, done) => {
    setCORSHeaders(req, res);

    let newPayload = payload == undefined ? {} : JSON.parse(payload);
    if (newPayload.statusCode >= 400) {
      delete newPayload.error;
      delete newPayload.message;
      done(null, JSON.stringify(newPayload));
    }
    else {
      done(null, payload);
    }
  });

  // ...
  app.listen(process.env.API_PORT, "0.0.0.0");

  process.on("SIGINT", function () {
    // graceful shutdown
    dbConnection.close();
    console.log("Closed MongoDB connection.");
    process.exit();
  });
}

run();