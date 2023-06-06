// to be signed by Client
import FileNFTContract from 0xFileNFTContract
import FilePrivilegesContract from 0xFilePrivilegesContract

transaction(id: String, name: String, description: String) {
  prepare(acct: AuthAccount) {
    let accountTokenCollection = acct.borrow<&FilePrivilegesContract.AccountTokenCollection>(from: /storage/filePrivileges)!
    
    acct.save(<- FileNFTContract.createEmptyCollection(
      accountTokenCollection: accountTokenCollection,
      id: id,
      name: name,
      index: acct.borrow<&FileNFTContract.FileNFTCollectionIndex>(from: /storage/fileNftIndex)!,
      description: description
    ), to: StoragePath(identifier: "fileNftCollection_".concat(id))!)
    
    // expose through restricted interface
    acct.link<&AnyResource{FileNFTContract.FileNFTCollectionPublicInterface}>(
      PublicPath(identifier: "fileNftCollection_".concat(id))!,
      target: StoragePath(identifier: "fileNftCollection_".concat(id))!
    )
  }
}