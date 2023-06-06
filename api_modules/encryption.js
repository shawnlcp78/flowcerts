const crypto = require('crypto');

function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
  let output = cipher.update(plaintext);
  output = Buffer.concat([output, cipher.final()]);
  return `${iv.toString("base64")}.${output.toString("base64")}`;
}

function decrypt(ciphertext, key) {
   const iv = Buffer.from(ciphertext.split(".")[0], 'base64');
   let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
   let plaintext = decipher.update(Buffer.from(ciphertext.split(".")[1], "base64"));
   plaintext = Buffer.concat([plaintext, decipher.final()]);
   return plaintext;
}

module.exports = { encrypt, decrypt };