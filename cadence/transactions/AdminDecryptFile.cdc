// to be signed by Admin
import FileNFTContract from 0xFileNFTContract
import FilePrivilegesContract from 0xFilePrivilegesContract

transaction(address: Address, collectionId: String, tokenId: UInt64, fileData: String, isEncrypted: Bool) {
  prepare(acct: AuthAccount) {
    let adminCapability = acct.borrow<&FilePrivilegesContract.FileAdminIndicator>(from: /storage/fileAdminIndicator)!

    let collection = getAccount(address).getCapability<&AnyResource{FileNFTContract.FileNFTCollectionPublicInterface}>(PublicPath(identifier: "fileNftCollection_".concat(collectionId))!).borrow()!
    collection.adminSetFileData(id: tokenId, adminCapability: adminCapability, fileData: fileData)
    collection.adminSetIsEncrypted(id: tokenId, adminCapability: adminCapability, isEncrypted: isEncrypted)
  }
}
