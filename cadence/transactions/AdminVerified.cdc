// to be signed by Admin
import FileNFTContract from 0xFileNFTContract
import FilePrivilegesContract from 0xFilePrivilegesContract

transaction(address: String, verifiedDomain: String, verifyLink: String) {
  prepare(acct: AuthAccount) {
    let centralStorage = acct
      .borrow<&FileNFTContract.FileNFTCentralStorage>(from: /storage/fileNftCentralStorage)
      ?? panic("Admin error")
    let adminCapability = acct.borrow<&FilePrivilegesContract.FileAdminIndicator>(from: /storage/fileAdminIndicator)!
    centralStorage.adminAddAccountData(address: address, adminCapability: adminCapability, verifiedDomain: verifiedDomain, verifyLink: verifyLink)
  }
}
