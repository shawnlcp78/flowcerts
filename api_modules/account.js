const process = require("process");
require('dotenv').config()

const crypto = require("crypto");
const short = require('short-uuid');

const Web3 = require('web3');
const web3 = new Web3(process.env.POLYGON_MUMBAI_RPC_URL);

const { chainlinkFunctionsObtainTxtRecord } = require("./chainlink-functions");
const { requestRandomWords, getRequest } = require("./chainlink-vrf")

let moduleOptions = {};
const appIdentifier = "FlowCerts";

const nonces = {};

async function adminInitAccountToken(req, res) {
  let session = moduleOptions.checkAuthToken(req.headers.authorization, false)
  if (!session) { res.statusCode = 401; res.send({}); }
  
  let accountEntry = await moduleOptions.dbConnection.db("flowcerts").collection("user").findOne({ addr: session.addr });

  if (!accountEntry || !accountEntry.verified) {
    res.statusCode = 200;
    res.send({
      success: false,
      error: "Account not verified yet.",
    });
    return;
  }

  // check if account has been init by client
  try {
    const cadenceCode = `// to be signed by Admin
import FileNFTContract3 from 0x8af0983838671200
import FilePrivilegesContract from 0x8af0983838671200

transaction(address: Address) {
  prepare(acct: AuthAccount) {
    let receiverAcct = getAccount(address)
    let receiver = receiverAcct
      .getCapability(/public/filePrivileges)
      .borrow<&AnyResource{FilePrivilegesContract.AccountTokenCollectionPublic}>()
      ?? panic("Unable to borrow AccountTokenCollectionPublic")

    receiver.setAccountToken(
      adminCapability: acct.borrow<&FilePrivilegesContract.FileAdminIndicator>(from: /storage/fileAdminIndicator)!,
      accountToken: <- FilePrivilegesContract.mintAccountToken(
        adminCapability: acct.borrow<&FilePrivilegesContract.FileAdminIndicator>(from: /storage/fileAdminIndicator)!,
        address: address.toString()
      )
    )
  }
}`;

    await moduleOptions.fcl.mutate({
      cadence: cadenceCode,
      proposer: moduleOptions.fclAdminAuthorizationFunction,
      payer: moduleOptions.fclAdminAuthorizationFunction,
      authorizations: [moduleOptions.fclAdminAuthorizationFunction],
      limit: 1000,
      args: (arg, t) => [
        arg(session.addr, t.Address),
      ],
    });

    res.statusCode = 200;
    res.send({
      success: true,
      newToken: moduleOptions.issueAuthToken(session.addr, true),
    });
  }
  catch (e) {
    console.log(e);
    res.statusCode = 200;
    res.send({
      success: false,
      error: "Account not verified yet.",
    });
  }
}

async function prepareVerificationData(req, res) {
  let session = moduleOptions.checkAuthToken(req.headers.authorization, false)
  if (!session) { res.statusCode = 401; res.send({}); }
  let accountEntry = await moduleOptions.dbConnection.db("flowcerts").collection("user").findOne({ addr: session.addr });

  res.statusCode = 200;

  if (accountEntry) {
    if (accountEntry.verified) { // already verified, CANNOT UPDATE DETAILS
      res.send({
        required: false,
        created: true,
      });
    }
    else if (accountEntry.vRecord) { // already has a record, no need to generate one; just update 
      await moduleOptions.dbConnection.db("flowcerts").collection("user").updateOne(
        { addr: session.addr },
        {
          $set: {
            name: req.body.name,
            domain: req.body.domain,
            email: req.body.email,
          }
        },
      );

      res.send({
        required: true,
        created: true,
      });
    }
  }
  else {
    let vrfId = (await requestRandomWords()).toString();

    await moduleOptions.dbConnection.db("flowcerts").collection("user").insertOne({
      addr: session.addr,
      name: req.body.name,
      domain: req.body.domain,
      email: req.body.email,
      verified: false,
      vRecord: {
        vrfId,
      },
    });

    res.send({
      required: true,
      created: false,
    });
  }
}

async function checkVerificationDataReady(req, res) {
  let session = moduleOptions.checkAuthToken(req.headers.authorization, false)
  if (!session) { res.statusCode = 401; res.send({}); }
  let accountEntry = await moduleOptions.dbConnection.db("flowcerts").collection("user").findOne({ addr: session.addr });
  let vrfReq = await getRequest(accountEntry.vRecord.vrfId);

  res.statusCode = 200;

  if (vrfReq.fulfilled) { // generate record with signature etc
    // CERTS_2E3ABD.{"addr":"0x03","verify":"0x0000000000000000000000000000000"}.SIGNATURE

    let dataToSign = JSON.stringify({
      addr: session.addr,
      verify: vrfReq.randomWords[0],
    });
    const hash = crypto.createHmac('sha256', process.env.DNS_RECORD_VERIFICATION_KEY).update(dataToSign).digest('base64');

    await moduleOptions.dbConnection.db("flowcerts").collection("user").updateOne(
      { addr: session.addr },
      {
        $set: {
          "vRecord.recordContent": `CERTS_2E3ABD.${dataToSign}.${hash}`,
        }
      },
    );

    res.send({
      ready: true,
      verificationRecord: {
        recordDomain: accountEntry.domain,
        recordContent: `CERTS_2E3ABD.${dataToSign}.${hash}`,
      },
    });
  }
  else {
    res.send({
      ready: false,
    });
  }
}

function performVerification(session) {
  return new Promise(async resolve => {
    let accountEntry = await moduleOptions.dbConnection.db("flowcerts").collection("user").findOne({ addr: session.addr });

    console.log(`Check triggered for ${session.addr}`);
  
    if (
      !accountEntry.verified &&
      (
        !accountEntry.vRecord.lastCheck ||
        (
          accountEntry.vRecord.lastCheck &&
          accountEntry.vRecord.lastCheck < (new Date()).getTime() - (1000 * 300) && // 5 mins
          accountEntry.vRecord.totalChecks < 100
        )
      )
    ) {
      chainlinkFunctionsObtainTxtRecord(accountEntry.domain, async (recordRes, txHash) => {
        let res = JSON.parse(JSON.parse(recordRes).value);
  
        console.log(res);
        console.log(txHash);
  
        if (res.success) { // check value against expected value in database
          if (res.value !== accountEntry.vRecord.recordContent) {
            resolve(false);
            return;
          }
          else {
            // write verification data to the Flow blockchain
            const cadenceCode = `// to be signed by Admin
  import FileNFTContract3 from 0x8af0983838671200
  import FilePrivilegesContract from 0x8af0983838671200
  
  transaction(address: String, verifiedDomain: String, verifyLink: String) {
    prepare(acct: AuthAccount) {
      let centralStorage = acct
        .borrow<&FileNFTContract3.FileNFTCentralStorage>(from: /storage/fileNftCentralStorage)
        ?? panic("Admin error")
      let adminCapability = acct.borrow<&FilePrivilegesContract.FileAdminIndicator>(from: /storage/fileAdminIndicator)!
      centralStorage.adminAddAccountData(address: address, adminCapability: adminCapability, verifiedDomain: verifiedDomain, verifyLink: verifyLink)
    }
  }`
  
            let txId = await moduleOptions.fcl.mutate({
              cadence: cadenceCode,
              proposer: moduleOptions.fclAdminAuthorizationFunction,
              payer: moduleOptions.fclAdminAuthorizationFunction,
              authorizations: [moduleOptions.fclAdminAuthorizationFunction],
              limit: 1000,
              args: (arg, t) => [
                arg(session.addr, t.String),
                arg(accountEntry.domain, t.String),
                arg(JSON.stringify({
                  txHash,
                  // IF POSSIBLE, ADD THE VRF TRANSACTION TOO!
                }), t.String),
              ],
            });
  
            await moduleOptions.dbConnection.db("flowcerts").collection("user").updateOne(
              { addr: session.addr },
              {
                $set: {
                  "verified": true,
                  "vRecord.verificationTx": txId,
                },
              },
            );
  
            resolve(txId); // callback with ID
            return;
          }
        }
        else {
          resolve(false);
          return;
        }
      });
  
      await moduleOptions.dbConnection.db("flowcerts").collection("user").updateOne(
        { addr: session.addr },
        {
          $set: {
            "vRecord.lastCheck": (new Date()).getTime(),
          },
          $inc: {
            "vRecord.totalChecks": 1,
          },
        },
      );
    }
    else if (accountEntry.verified) {
      resolve(accountEntry.vRecord.verificationTx);
      return;
    }
    else {
      resolve(false);
      return;
    }
  });
}

async function performVerificationAPIWrapper(req, res) { // has rate-limiting, 5 minutes each time, up to a maximum of 20 requests.
  let session = moduleOptions.checkAuthToken(req.headers.authorization, false)
  if (!session) { res.statusCode = 401; res.send({}); }
  let vResult = await performVerification(session);

  if (!vResult) {
    res.statusCode = 200;
    res.send({
      verified: false,
    });
  }
  else {
    res.statusCode = 200;
    res.send({
      verified: true,
      txHash: vResult,
    });
  }
}

async function checkToken(req, res) {
  let session = moduleOptions.checkAuthToken(req.headers.authorization, false);
  // let accountEntry = await moduleOptions.dbConnection.db("flowcerts").collection("user").findOne({ addr: session.addr });
  // let renewForSetup = false;

  // if (accountEntry && accountEntry.verified && !session.setup) {
  //   renewForSetup = moduleOptions.issueAuthToken(accountProofData.address, true);
  // }

  res.statusCode = 200;
  res.send({
    data: session,
    // renewForSetup,
  });
}

function accountProofResolver(req, res) {
  const nonce = crypto.randomBytes(32).toString("hex");
  nonces[nonce] = (new Date()).getTime() + (300 * 1000); // expire in 5 minutes

  res.statusCode = 200;
  res.send({
    nonce,
    appIdentifier,
  });
}

async function accountProofVerifier(req, res) {
  const accountProofData = req.body.accountProofData;

  // check if nonce has expired
  if (nonces[accountProofData.nonce]) {
    const isValid = await moduleOptions.fcl.AppUtils.verifyAccountProof(
      appIdentifier,
      accountProofData,
    );

    if (isValid) {
      // once account proof is verified, check if address exists in database
      let accountEntry = await moduleOptions.dbConnection.db("flowcerts").collection("user").findOne({ addr: accountProofData.address });

      res.statusCode = 200;
      res.send({
        token: moduleOptions.issueAuthToken(accountProofData.address, accountEntry ? accountEntry.verified ? true : false : false),
      });
      return;
    }
  }

  res.statusCode = 403;
  res.send({});
}

function accountAPI(app, options, done) {
  moduleOptions = options;

  app.post("/api/checkToken", {
    schema: {
      headers: options.authorizationValidation,
    },
  }, checkToken);

  app.post("/api/verification/requestRecord", {
    schema: {
      headers: options.authorizationValidation,
      body: {
        type: "object",
        required: ["name", "domain", "email"],
        properties: {
          name: { type: "string" },
          domain: { type: "string" },
          email: { type: "string" },
        },
      },
    },
  }, prepareVerificationData);

  app.post("/api/verification/getRecord", {
    schema: {
      headers: options.authorizationValidation,
    },
  }, checkVerificationDataReady);

  app.post("/api/verification/verify", {
    schema: {
      headers: options.authorizationValidation,
    },
  }, performVerificationAPIWrapper);

  app.post("/api/account/adminInit", {
    schema: {
      headers: options.authorizationValidation,
    },
  }, adminInitAccountToken);

  app.post("/api/accountProof/resolve", { // FCL account proof resolver
    schema: {
    },
  }, accountProofResolver);

  app.post("/api/accountProof/verify", { // FCL account proof verifier + auth token issuer
    schema: {
      body: {
        type: "object",
        properties: {
          accountProofData: { type: "object" },
        },
      },
    },
  }, accountProofVerifier);

  done();
}

setInterval(() => {
  for (const n of Object.keys(nonces)) {
    // if (nonces[n] < (new Date()).getTime()) delete nonces[n];
  }
}, 300 * 1000);

accountAPI[Symbol.for('skip-override')] = true;
module.exports = accountAPI;