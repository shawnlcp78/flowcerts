const process = require("process");
require('dotenv').config()

const short = require('short-uuid');
const fs = require('fs');
const JSZip = require("jszip");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { execSync } = require("child_process");
var QRCode = require('qrcode')
const sharp = require("sharp")
const crypto = require("crypto");

const { encrypt, decrypt } = require("./encryption");

let moduleOptions = {};

async function decryptFile(req, res) {
  
}

async function readFile(req, res) {
  const cadenceCode = `import FileNFTContract3 from 0x8af0983838671200
import FilePrivilegesContract from 0x8af0983838671200
import FileShortcutsContract4 from 0x8af0983838671200

pub fun main(shortcut: String): {String: String} {
  // Get shortcut
  let address = FileShortcutsContract4.getA(key: shortcut)
  let collectionId = FileShortcutsContract4.getC(key: shortcut)
  let tokenId = FileShortcutsContract4.getF(key: shortcut)

  let output: {String: String} = {}

  // Basic data
  let publicInterface = getAccount(address).getCapability<&AnyResource{FileNFTContract3.FileNFTCollectionPublicInterface}>(PublicPath(identifier: "fileNftCollection_".concat(collectionId))!).borrow()!

  let file <- publicInterface.getFile(id: tokenId)

  output["id"] = file.id
  output["fileData"] = file.fileData
  output["fileName"] = file.fileName
  output["isEncrypted"] = file.isEncrypted == true ? "true" : "false"
  output["collectionName"] = file.collectionName
  output["originalFileHash"] = file.originalFileHash
  output["isActive"] = file.isActive == true ? "true" : "false"

  // Verification data
  let verificationPublicInterface = getAccount(0x8af0983838671200).getCapability<&AnyResource{FileNFTContract3.AccountDataSource}>(/public/accountDataSource).borrow()!

  let verificationData = verificationPublicInterface.getCollectionVerificationData(collectionId: collectionId)
  output["verifiedDomain"] = verificationData["verifiedDomain"]!
  output["verifyLink"] = verificationData["verifyLink"]!

  destroy file

  return output
}`;

  try {
    const file = await moduleOptions.fcl.query({
      cadence: cadenceCode,
      args: (arg, t) => [
        arg(req.body.shortcutID, t.String),
      ]
    });

    let fileDecrypted = decrypt(file.fileData, `${req.body.key}${req.body.key}`.substring(0, 32));

    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileDecrypted);

    if (hashSum.digest('hex') !== file.originalFileHash) {
      res.statusCode = 200;
      res.send({
        integrity: false,
      });
      return;
    }

    res.statusCode = 200;
    res.send({
      fileData: fileDecrypted.toString("base64"),
    });
  }
  catch (e) { console.log(e); }
}

async function attachFileContents(req, res) {
  let session = moduleOptions.checkAuthToken(req.headers.authorization, true);
  if (!session) { res.statusCode = 401; res.send({}); return; }

  if (!fs.existsSync(`certs-tmp/${session.addr}`)) { res.statusCode = 401; res.send({}); return; }

  // get collection settings
  let accountEntry = await moduleOptions.dbConnection.db("flowcerts").collection("user").findOne({ addr: session.addr });
  let cSettings = await moduleOptions.dbConnection.db("flowcerts").collection("collections").findOne({ _id: req.body.collectionId, addr: session.addr });
  if (!accountEntry || !accountEntry.verified || !cSettings) { res.statusCode = 401; res.send({}); return; }

  let uploadData = cSettings.currentUpload;
  const promises = [];

  let sequenceNum = (await moduleOptions.fcl.account("0x8af0983838671200")).keys[0].sequenceNumber;
  console.log(sequenceNum);

  res.statusCode = 200;
  res.send({ success: true });

  for (let i = 0; i < uploadData.length; i++) {
    const u = uploadData[i];

    let fileDataBuffer = fs.readFileSync(`certs-tmp/${u.userAddr}/${u.fileID}.pdf`);
    let fileDataToStore = fileDataBuffer.toString("base64");

    if (u.encrypted) {
      fileDataToStore = encrypt(fileDataBuffer, `${u.encryptionKey}${u.encryptionKey}`.substring(0, 32));
    }

    await moduleOptions.fcl.mutate({
      cadence: `import FileShortcutsContract4 from 0x8af0983838671200
import FilePrivilegesContract from 0x8af0983838671200
import FileNFTContract3 from 0x8af0983838671200

transaction(shortcutKey: String, address: Address, collectionId: String, tokenId: String, fileData: String) {
  prepare (admin: AuthAccount) {
    let adminCapability = admin.borrow<&FilePrivilegesContract.FileAdminIndicator>(from: /storage/fileAdminIndicator)!
    FileShortcutsContract4.set(adminCapability: adminCapability, key: shortcutKey, a: address, c: collectionId, f: tokenId)

    let collection = getAccount(address).getCapability<&AnyResource{FileNFTContract3.FileNFTCollectionPublicInterface}>(PublicPath(identifier: "fileNftCollection_".concat(collectionId))!).borrow()!
    collection.adminSetFileData(id: tokenId, adminCapability: adminCapability, fileData: fileData)
  }
}`,
      proposer: (txAccount) => {
        let out = moduleOptions.fclAdminAuthorizationFunction(txAccount);
        out.sequenceNum = sequenceNum + i;
        return out;
      },
      payer: (txAccount) => {
        let out = moduleOptions.fclAdminAuthorizationFunction(txAccount);
        out.sequenceNum = sequenceNum + i;
        return out;
      },
      authorizations: [(txAccount) => {
        let out = moduleOptions.fclAdminAuthorizationFunction(txAccount);
        out.sequenceNum = sequenceNum + i;
        return out;
      }],
      limit: 9999,
      args: (arg, t) => [
        arg(u.shortcutID, t.String),
        arg(u.userAddr, t.Address),
        arg(req.body.collectionId, t.String),
        arg(u.fileID, t.String),
        arg(fileDataToStore, t.String),
      ],
    });
  }
}

async function uploadZip(req, res) {
  let session = moduleOptions.checkAuthToken(req.headers.authorization, true);
  if (!session) { res.statusCode = 401; res.send({}); return; }

  // prepare zip file
  const files = await req.saveRequestFiles({ limits: { fileSize: 104857600, files: 1 } }); // 100 MB 
  fs.renameSync(files[0].filepath, `certs-tmp/${session.addr}.zip`);
  let collectionId = files[0].fields.collectionID.value;

  // get collection settings
  let accountEntry = await moduleOptions.dbConnection.db("flowcerts").collection("user").findOne({ addr: session.addr });
  let cSettings = await moduleOptions.dbConnection.db("flowcerts").collection("collections").findOne({ _id: collectionId, addr: session.addr });
  if (!accountEntry || !accountEntry.verified || !cSettings) { res.statusCode = 401; res.send({}); return; }

  const promises = [];

  if (fs.existsSync(`certs-tmp/${session.addr}`)) fs.rmdirSync(`certs-tmp/${session.addr}`, { recursive: true, force: true });
  fs.mkdirSync(`certs-tmp/${session.addr}`);

  let zip = await JSZip.loadAsync(fs.readFileSync(`certs-tmp/${session.addr}.zip`));

  zip.forEach(function (relativePath, zipEntry) {
    if (!zipEntry.name.endsWith(".pdf") || zipEntry.name.includes("/")) return;

    promises.push(new Promise(async resolve => {
      /*
        shortcutID -> https://flowcerts.net/#SHORTCUTID/ENCRYPTION
        encryptionKey
        fileID -> actual ID on the FileNFT
        collectionID
        unlockID -> for decrypting
      */

      let thisFile = {
        userAddr: session.addr,
        content: "placeholder",
        hash: null,
        filename: zipEntry.name,
        encrypted: cSettings.security === 1 || cSettings.security === 2,
        active: true,
        security: cSettings.security,
      };

      console.log(thisFile);

      let shortcutID = short.generate(); thisFile.shortcutID = shortcutID;
      let encryptionKey = short.generate(); thisFile.encryptionKey = encryptionKey;
      let fileID = short.generate(); thisFile.fileID = fileID;
      let unlockID = short.generate(); thisFile.unlockID = unlockID;

      let urlHash = `#${shortcutID}`;

      if (cSettings.security === 1 || cSettings.security === 2) {
        urlHash += `/${encryptionKey}`;
      }

      if (cSettings.security === 1) {
        await moduleOptions.dbConnection.db("flowcerts").collection("unlockIDs").insertOne({
          _id: unlockID,
          addr: session.addr,
          collectionId,
          fileId: fileID,
          used: false,
        })
      }

      const d = cSettings.card.boxPos;

      // generate QR code, generate SVG -> PNG, paste into PDF
      QRCode.toDataURL(`https://flowcerts.net/${urlHash}`, function (err, url) {
        console.log(url);
        sharp(Buffer.from(`<svg width="700" height="200" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect x="0" y="0" rx="10" ry="10" width="700" height="200" style="fill:#e5e7eb;" />
	<image x="10" y="10" width="180" height="180" xlink:href="${url}" />
    <text x="205" y="30" style="fill:black;">
      <tspan font-family="sans-serif" x="205" y="55" font-size="2.5em" style="font-weight: 550;">Issuer: ${accountEntry.domain}</tspan>
      <tspan font-family="sans-serif" x="205" y="100" font-size="1.5em">Certificate Secured by FlowCerts</tspan>
      <tspan font-family="sans-serif" x="205" y="135" font-size="1.5em" fill="#1e40af">Scan QR Code or verify authenticity at: flowcerts.net/</tspan>
      <tspan font-family="sans-serif" x="205" y="135" font-size="1.5em">Scan QR Code or verify authenticity at: </tspan>
      <tspan font-family="sans-serif" x="205" y="167" font-size="1.3em" fill="#1e40af">${urlHash}</tspan>
    </text>
</svg>`))
          .png()
          .toBuffer()
          .then(async function (pngImageBytes) {
            let pdfDoc = await PDFDocument.load(await zip.file(zipEntry.name).async("nodebuffer"));
            const pngImage = await pdfDoc.embedPng(pngImageBytes)
            const page = pdfDoc.getPage(cSettings.card.page);

            const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
            page.drawText(`/CERTS_2E3ACE${urlHash}/`, {
              x: d.x * page.getWidth(),
              y: ((1 - d.y) * page.getHeight()) - (d.height * page.getHeight()),
              size: 2,
              font: helveticaFont,
              color: rgb(0, 0, 0),
            });

            page.drawImage(pngImage, {
              x: d.x * page.getWidth(),
              y: ((1 - d.y) * page.getHeight()) - (d.height * page.getHeight()),
              width: d.width * page.getWidth(),
              height: d.height * page.getHeight(),
            });

            // write and compress PDF
            fs.writeFileSync(`certs-tmp/${session.addr}/${fileID}.o.pdf`, await pdfDoc.save());
            execSync(`ghostscript -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile=certs-tmp/${session.addr}/${fileID}.pdf certs-tmp/${session.addr}/${fileID}.o.pdf`)

            let compressedBuffer = fs.readFileSync(`certs-tmp/${session.addr}/${fileID}.pdf`);
            const hashSum = crypto.createHash('sha256');
            hashSum.update(compressedBuffer);
            thisFile.hash = hashSum.digest('hex');

            let fileSize = Buffer.byteLength(compressedBuffer);
            if (fileSize > 600000) thisFile.tooLarge = true;

            resolve(thisFile)
          })
          .catch(function (err) {
            console.log(err)
          })
      });
    }));
  });

  await Promise.all(promises).then(async data => {
    await moduleOptions.dbConnection.db("flowcerts").collection("collections").updateOne(
      { _id: collectionId, addr: session.addr },
      {
        $set: {
          currentUpload: data,
        }
      },
    )
    res.statusCode = 200;
    res.send(data);
  });
}

async function initCollection(req, res) {
  let session = moduleOptions.checkAuthToken(req.headers.authorization, true);
  if (!session) { res.statusCode = 401; res.send({}); }

  /*
  id: collectionId,
  collectionDetails,
  selectedPdfPage,
  boxPos,
  currentBoxDesign,
  selectedSecurity
  */

  await moduleOptions.dbConnection.db("flowcerts").collection("collections").insertOne({
    _id: req.body.id,
    addr: session.addr,
    name: req.body.collectionDetails.name,
    desc: req.body.collectionDetails.desc,
    security: req.body.selectedSecurity,
    card: {
      page: req.body.currentPdfPage,
      design: req.body.currentBoxDesign,
      boxPos: req.body.boxPosPercentage,
      invert: req.body.boxPos.invert,
    },
  });

  res.statusCode = 200;
  res.send({
    success: true,
  });
}

function filesAPI(app, options, done) {
  moduleOptions = options;

  app.post("/api/files/uploadZip", uploadZip); // zip file

  app.post("/api/collections/init", initCollection);

  app.post("/api/files/attachFileContents", attachFileContents);

  app.post("/api/files/get", readFile);

  // app.post("/api/files/saveToBlockchain", {
  //   schema: {
  //     headers: options.authorizationValidation,
  //     body: {
  //       type: "object",
  //       required: ["name", "domain", "email"],
  //       properties: {
  //         name: { type: "string" },
  //         domain: { type: "string" },
  //         email: { type: "string" },
  //       },
  //     },
  //   },
  // }, prepareVerificationData);

  // app.post("/api/files/decrypt", {
  //   schema: {
  //     headers: options.authorizationValidation,
  //   },
  // }, checkVerificationDataReady);

  // app.post("/api/files/verify", {
  //   schema: {
  //     headers: options.authorizationValidation,
  //   },
  // }, performVerificationAPIWrapper);

  done();
}

filesAPI[Symbol.for('skip-override')] = true;
module.exports = filesAPI;