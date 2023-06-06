// to be signed by Client
import FileNFTContract from 0xFileNFTContract
import FilePrivilegesContract from 0xFilePrivilegesContract

transaction(uuid: String, f: [[String]]) {
  prepare(acct: AuthAccount) {
    let at = acct.borrow<&FilePrivilegesContract.AccountTokenCollection>(from: /storage/filePrivileges)!

    for e in f {
      let newNft <- getAccount(0x02).getCapability<&FileNFTContract.FileNFTMinter>(/public/fileNftMinter).borrow()!.createFile(
        accountTokenCollection: at,
        fileData: e[0],
        originalFileHash: e[1],
      )

      let fileTokenCollection = acct.borrow<&FileNFTContract.FileNFTCollection>(from: StoragePath(identifier: "fileNftCollection_".concat(uuid))!)!
      fileTokenCollection.addFileMetadata(
        id: newNft.getId(),
        fileName: e[2],
        isEncrypted: e[3] == "true" ? true : false,
        isActive: e[4] == "true" ? true : false,
      )
      fileTokenCollection.deposit(
        nft: <- newNft
      )
    }
  }
}