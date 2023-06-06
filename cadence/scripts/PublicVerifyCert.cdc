import FileNFTContract from 0x02
import FilePrivilegesContract from 0x02

pub fun main(address: Address, collectionId: String, tokenId: UInt64): {String: String} {
  let output: {String: String} = {}

  // Basic data
  let publicInterface = getAccount(0x03)
    .getCapability<&AnyResource{FileNFTContract.FileNFTCollectionPublicInterface}>(PublicPath(identifier: "fileNftCollection_".concat(collectionId))!).borrow()!

  let file <- publicInterface.getFile(id: tokenId)

  output["id"] = file.id?.toString()
  output["fileData"] = file.fileData
  output["fileName"] = file.fileName
  output["isEncrypted"] = file.isEncrypted == true ? "true" : "false"
  output["collectionName"] = file.collectionName
  output["originalFileHash"] = file.originalFileHash
  output["isActive"] = file.isActive == true ? "true" : "false"

  // Verification data
  let verificationPublicInterface = getAccount(0x02)
    .getCapability<&AnyResource{FileNFTContract.AccountDataSource}>(/public/accountDataSource).borrow()!

  let verificationData = verificationPublicInterface.getCollectionVerificationData(collectionId: collectionId)
  output["verifiedDomain"] = verificationData["verifiedDomain"]!
  output["verifyLink"] = verificationData["verifyLink"]!

  destroy file

  return output
}
