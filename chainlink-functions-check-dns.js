// Use Chainlink Functions to verify that an organisation has updated their DNS TXT records to verify their ownership of a domain
// The domain is important information which is reflected on certificates
const crypto = require('crypto');

// arguments
// 0 - domain name

// secrets
// verificationKey - secret used to verify that the TXT record was not modified

const dnsRes1 = await Functions.makeHttpRequest({
  url: `https://dns.google/resolve?name=${args[0]}&type=txt`,
  headers: { "accept": "application/dns-json" },
})

const dnsRes2 = await Functions.makeHttpRequest({
  url: `https://cloudflare-dns.com/dns-query?name=${args[0]}&type=txt`,
  headers: { "accept": "application/dns-json" },
})

// Check 1 - make sure both providers contain the record
function findRelevantRecord(res) {
  if (res.data.Status !== 0 || !res.data.Answer) return false
  for (const record of res.data.Answer) {
    // CERTS_2E3ABD.{"addr":"0x03","verify":"0x0000000000000000000000000000000"}.SIGNATURE
    if (record.data.includes("CERTS_2E3ABD")) {
      if (record.data.startsWith('"')) record.data = record.data.substring(1)
      if (record.data.endsWith('"')) record.data = record.data.substring(0, record.data.length - 1)

      let elements = record.data.split(".")
      elements.shift()
      let signature = elements.pop()
      let data = elements.join(".")

      // Calcuate and verify signature
      const hash = crypto.createHmac('sha256', secrets.verificationKey).update(data).digest('base64');
      if (hash !== signature) return false

      return record.data
    }
  }

  return false
}

let res1 = findRelevantRecord(dnsRes1)
let res2 = findRelevantRecord(dnsRes2)
console.log(res1, res2)

// Options are
// - Functions.encodeUint256
// - Functions.encodeInt256
// - Functions.encodeString
if (
  (res1 && res2) && // no errors
  res1 === res2 // same value
) {
  return Functions.encodeString(JSON.stringify({
    success: true,
    value: res1,
  }))
}
else {
  return Functions.encodeString(JSON.stringify({
    success: false,
  }))
}